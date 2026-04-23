export type LearningOption = { id: string; label: string; sub: string };

export function getLearningStyles(major: string): LearningOption[] {
  const m = major.toLowerCase();
  if (/computer science|computer engineering|data science/.test(m))
    return [
      { id: "project",        label: "Project-Based",    sub: "Building systems, shipping products" },
      { id: "theoretical",    label: "Theoretical",      sub: "Algorithms, complexity, proofs" },
      { id: "career_focused", label: "Career-Focused",   sub: "Industry prep, interviews, internships" },
      { id: "no_pref",        label: "No Preference",    sub: "" },
    ];
  if (/electrical|aerospace|mechanical|structural|nanoengineering/.test(m))
    return [
      { id: "design_build",  label: "Design & Build",   sub: "Hardware, prototyping, fabrication" },
      { id: "theoretical",   label: "Theoretical",      sub: "Analysis, modeling, simulation" },
      { id: "lab_intensive", label: "Lab-Intensive",    sub: "Circuits, materials, hands-on tests" },
      { id: "no_pref",       label: "No Preference",    sub: "" },
    ];
  if (/chemical engineering|bioengineering/.test(m))
    return [
      { id: "lab_intensive", label: "Lab-Intensive",    sub: "Synthesis, experiments, instrumentation" },
      { id: "design_build",  label: "Design & Process", sub: "Scale-up, process, manufacturing" },
      { id: "theoretical",   label: "Theoretical",      sub: "Thermodynamics, transport phenomena" },
      { id: "no_pref",       label: "No Preference",    sub: "" },
    ];
  if (/^mathematics|math-cs|physics/.test(m))
    return [
      { id: "theoretical", label: "Pure / Abstract",        sub: "Proofs, rigor, abstraction" },
      { id: "applied",     label: "Applied / Computational", sub: "Modeling, numerical methods, stats" },
      { id: "no_pref",     label: "No Preference",           sub: "" },
    ];
  if (/biology|biochemistry|microbiology|molecular|physiology|ecology|pharmacological/.test(m))
    return [
      { id: "lab_intensive",    label: "Lab-Intensive",      sub: "Wet lab, bench work, experiments" },
      { id: "research_focused", label: "Research",           sub: "Literature, hypotheses, discovery" },
      { id: "clinical_applied", label: "Pre-Med / Clinical", sub: "Patient-centered, clinical application" },
      { id: "no_pref",          label: "No Preference",      sub: "" },
    ];
  if (/neuroscience|cognitive|psychology|biophysics/.test(m))
    return [
      { id: "research_experimental", label: "Research / Experimental", sub: "Lab studies, data collection" },
      { id: "clinical_applied",      label: "Clinical / Applied",      sub: "Counseling, behavior, intervention" },
      { id: "computational",         label: "Computational",           sub: "Modeling, data analysis, stats" },
      { id: "no_pref",               label: "No Preference",           sub: "" },
    ];
  if (/^chemistry/.test(m))
    return [
      { id: "lab_intensive", label: "Lab-Intensive", sub: "Synthesis, spectroscopy, experiments" },
      { id: "theoretical",   label: "Theoretical",   sub: "Quantum, thermodynamics, mechanisms" },
      { id: "industrial",    label: "Industrial",    sub: "Formulation, process, industry" },
      { id: "no_pref",       label: "No Preference", sub: "" },
    ];
  if (/economics|political|sociology|anthropology|international|global health|public health|urban/.test(m))
    return [
      { id: "quantitative",   label: "Quantitative",   sub: "Stats, econometrics, data analysis" },
      { id: "qualitative",    label: "Qualitative",    sub: "Writing, ethnography, discourse" },
      { id: "policy_focused", label: "Policy-Focused", sub: "Real-world impact, advocacy" },
      { id: "no_pref",        label: "No Preference",  sub: "" },
    ];
  if (/literature|history|philosophy|theatre|music|visual arts|jewish|latin american|middle eastern|african american|critical gender/.test(m))
    return [
      { id: "writing_intensive", label: "Writing-Intensive",   sub: "Essays, analysis, rhetoric" },
      { id: "critical_theory",   label: "Critical Theory",     sub: "Concepts, frameworks, interpretation" },
      { id: "performance_studio",label: "Performance / Studio", sub: "Creating, performing, making" },
      { id: "no_pref",           label: "No Preference",       sub: "" },
    ];
  if (/human biology|bioinformatics/.test(m))
    return [
      { id: "clinical_applied", label: "Pre-Med / Clinical", sub: "Patient-centered, health systems" },
      { id: "research_focused", label: "Research",           sub: "Population health, biomedical" },
      { id: "computational",    label: "Computational",      sub: "Bioinformatics, data analysis" },
      { id: "no_pref",          label: "No Preference",      sub: "" },
    ];
  if (/communication|linguistics/.test(m))
    return [
      { id: "qualitative",           label: "Qualitative / Writing", sub: "Analysis, writing, discourse" },
      { id: "research_experimental", label: "Research",              sub: "Studies, surveys, data" },
      { id: "no_pref",               label: "No Preference",         sub: "" },
    ];
  return [
    { id: "project",     label: "Project-Based", sub: "Hands-on, building, applying" },
    { id: "theoretical", label: "Theoretical",   sub: "Analysis, concepts, rigor" },
    { id: "no_pref",     label: "No Preference", sub: "" },
  ];
}
