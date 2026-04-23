export type ConcernOption = {
  id: string;
  label: string;
};

const GLOBAL_CONCERNS: ConcernOption[] = [
  { id: "workload", label: "Heavy Workload" },
  { id: "scheduling", label: "Tight Scheduling" },
  { id: "commute", label: "Long Commute" },
  { id: "gpa", label: "GPA Protection" },
  { id: "attendance", label: "Attendance Requirements" },
];

const STEM_THEORY_CONCERNS: ConcernOption[] = [
  { id: "heavy_math_load", label: "Heavy Math Load" },
  { id: "theoretical_classes", label: "Theoretical Classes" },
];

const BIO_CHEM_CONCERNS: ConcernOption[] = [
  { id: "lab_scheduling", label: "Lab Scheduling" },
  { id: "ochem", label: "Organic Chemistry" },
];

const ENGINEERING_CONCERNS: ConcernOption[] = [
  { id: "lab_scheduling", label: "Lab Scheduling" },
  { id: "group_projects", label: "Group Projects" },
];

const WRITING_INTENSIVE_CONCERNS: ConcernOption[] = [
  { id: "reading_writing_intensity", label: "Reading/Writing Intensity" },
  { id: "discussion_heavy", label: "Discussion-Heavy Classes" },
];

function getMajorConcernCategory(major: string):
  | "stem_theory"
  | "bio_chem"
  | "engineering"
  | "writing_intensive"
  | "default" {
  const m = major.toLowerCase();

  if (/computer science|computer engineering|data science|mathematics|math|physics|bioinformatics/.test(m)) {
    return "stem_theory";
  }

  if (/biology|biochemistry|microbiology|molecular|human biology|physiology|pharmacological|chemistry/.test(m)) {
    return "bio_chem";
  }

  if (/engineering|nanoengineering|structural/.test(m)) {
    return "engineering";
  }

  if (/history|literature|philosophy|theatre|music|visual arts|communication|linguistics|anthropology|sociology|political science/.test(m)) {
    return "writing_intensive";
  }

  return "default";
}

export function getConcernOptions(major: string): ConcernOption[] {
  const category = getMajorConcernCategory(major);

  if (category === "stem_theory") return [...GLOBAL_CONCERNS, ...STEM_THEORY_CONCERNS];
  if (category === "bio_chem") return [...GLOBAL_CONCERNS, ...BIO_CHEM_CONCERNS];
  if (category === "engineering") return [...GLOBAL_CONCERNS, ...ENGINEERING_CONCERNS];
  if (category === "writing_intensive") return [...GLOBAL_CONCERNS, ...WRITING_INTENSIVE_CONCERNS];

  return GLOBAL_CONCERNS;
}
