export interface SectionMeeting {
  section_type: string;
  days: string;
  start_time: string;
  end_time: string;
  location: string;
}

export interface CourseEntry {
  course_code: string;
  course_title: string;
  professor_name: string;
  meetings: SectionMeeting[];
}

export interface ParseScreenshotResponse {
  courses: CourseEntry[];
}

export async function parseScreenshot(
  file: File,
): Promise<ParseScreenshotResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("http://localhost:8000/api/parse-screenshot", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Parse failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<ParseScreenshotResponse>;
}
