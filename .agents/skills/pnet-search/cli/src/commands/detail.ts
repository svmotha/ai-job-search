import { BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a bare numeric ID, a /job/<id> URL, or a PNet SEO listing URL. */
function normalizeId(input: string): string | null {
  const bare = input.match(/^\d{5,}$/)
  if (bare) return input
  const inline = input.match(/--(\d{5,})-inline/)
  if (inline) return inline[1]
  const jobPath = input.match(/\/jobs?\/(\d{5,})(?:[/?#]|$)/)
  if (jobPath) return jobPath[1]
  const any = input.match(/(\d{6,})/)
  return any ? any[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE}/job/${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job) {
      writeError(
        "Could not parse job detail (no JobPosting data on page)",
        "PARSE_FAILED",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.industry ? `Industry: ${job.industry}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.deadline ? `Apply before: ${job.deadline}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
