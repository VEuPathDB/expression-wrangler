import { writeFile } from "fs/promises";
import { FullIndividualResponseType, SummaryResponseType } from "./types";
import git from 'git-rev-sync';

export async function writeToFile(filename: string, content: string): Promise<void> {
  try {
    await writeFile(filename, content, "utf-8");
    console.log(`File written successfully to ${filename}`);
  } catch (error) {
    console.error("Error writing to file:", error);
  }
}


// remove any duplicates and add an "Others" section if any were missed
export function consolidateSummary(
  summaryResponse: SummaryResponseType,
  individualResults: FullIndividualResponseType[],
) : SummaryResponseType {

  // Gather all dataset IDs from individualResults
  const allDatasetIds = new Set(
    individualResults.map(({ dataset_id }: { dataset_id: string }) => dataset_id)
  );

  const seenDatasetIds = new Set();
  const deduplicated = {
    ...summaryResponse,
    sections: summaryResponse.sections.map(
      (section) => ({
	...section,
	dataset_ids: section.dataset_ids.filter(
	  (id) => {
	    // warn and skip if the id doesn't exist
	    if (!allDatasetIds.has(id)) {
	      console.log(`WARNING: summary section id '${id}' does not exist. Excluding from HTML output.`);
	      return false;
	    }
	    // skip if we've seen it
            if (seenDatasetIds.has(id)) return false;
            seenDatasetIds.add(id);
            return true;
	  }
	)
      })
    )
  }

  // Find missing dataset IDs
  const missingDatasetIds = Array.from(allDatasetIds).filter(
    (id) => !seenDatasetIds.has(id)
  );

  // If there are missing IDs, add an "Others" section
  if (missingDatasetIds.length > 0) {
    deduplicated.sections.push({
      headline: "Other",
      one_sentence_summary: "These experiments were not grouped into sub-sections by the AI.",
      dataset_ids: missingDatasetIds,
    });
  }
  
  return deduplicated;
}

export function summaryJSONtoHTML(
  summaryResponse: SummaryResponseType,
  geneId: string,
  individualResults: FullIndividualResponseType[],
  expressionGraphs: any[],
  serverUrl: string,
  geneBaseUrl: string,
): string {
  // Destructure the summary response
  const { headline, one_paragraph_summary, sections } = summaryResponse;

  // Build the HTML structure
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${geneId} - Expression Summary</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
    h1, h2, h3 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
    img { max-width: 100px; }
    .human-readable { max-width: 35em; }
  </style>
</head>
<body>
  <h1><a href="${geneBaseUrl}/${geneId}">${geneId}</a> - ${headline}</h1>
  <p class="human-readable">${one_paragraph_summary}</p>
  ${sections.map(section => `
    <section>
      <h2>${section.headline}</h2>
      <p class="human-readable">${section.one_sentence_summary}</p>
      <table>
        <thead>
          <tr>
            <th>Preview</th>
            <th>Name</th>
            <th>Summary</th>
            <th>Attribution</th>
            <th>Assay Type</th>
          </tr>
        </thead>
        <tbody>
    ${section.dataset_ids.map(datasetId => {
      const expressionGraph = expressionGraphs.find(({dataset_id} : {dataset_id: string }) => datasetId == dataset_id);
      const individualResult = individualResults.find(({dataset_id} : {dataset_id: string}) => datasetId == dataset_id);
      const thumbnailRaw = (expressionGraph?.['thumbnail'] ?? 'N/A') as string;
      const thumbnailFinal = thumbnailRaw.replace('/cgi-bin', `${serverUrl}/cgi-bin`);
      return `
<tr>
<td>${thumbnailFinal}</td>
<td>${individualResult?.display_name}</td>
<td class="human-readable">${individualResult?.one_sentence_summary}</td>
<td>${expressionGraph?.short_attribution}</td>
<td>${individualResult?.assay_type}</td>
</tr>`;
    }).join('')}
        </tbody>
      </table>
    </section>
  `).join('')}
</body>
<footer>
<p>Generated by the <a href="https://github.com/VEuPathDB/expression-shepherd">Expression Shepherd</a> at commit <a href="https://github.com/VEuPathDB/expression-shepherd/commit/${git.short()}" target="_blank">${git.short()}</a>${git.isDirty() ? ' (plus uncommitted changes)' : ''} on ${git.date()}</p>
</footer>
</html>
  `;

  return html;
}
