import type { MockDossierPayload } from "@/types/dossier";

export const mockDossier: MockDossierPayload = {
  activeQuarterId: "sp26",
  quarters: [
    { id: "sp26", label: "Spring 2026", isActive: true },
    { id: "wi26", label: "Winter 2026" },
    { id: "fa25", label: "Fall 2025" },
  ],
  vaultItems: [
    {
      id: "v1",
      name: "CSE_120_Syllabus_Spring26.pdf",
      kind: "syllabus",
      updatedAt: "Mar 28",
    },
    {
      id: "v2",
      name: "WebReg_TableView.html",
      kind: "webreg",
      updatedAt: "Mar 27",
    },
    {
      id: "v3",
      name: "Degree_Audit_Notes.md",
      kind: "note",
      updatedAt: "Jan 12",
    },
  ],
  classes: [
    {
      id: "c1",
      courseCode: "CSE 120",
      courseTitle: "Computer Architecture",
      professorName: "Pasquale",
      professorInitials: "RP",
      condensedSummary: [
        "Exams skew toward pipeline + cache problems; past finals repeat structures.",
        "Sections are high-signal—TAs post worked examples the night before quizzes.",
        "Office hours Wednesday get crowded; Thursday morning is quieter.",
      ],
      tldr:
        "Pasquale runs a fair but fast-paced architecture course. Students who grind the discussion worksheets and the textbook’s practice sets report the fewest surprises on exams. Podcasting is reliable for this room historically, but verify HyFlex each quarter.",
      confidencePercent: 88,
      chips: [
        { id: "ch1", label: "Podcasted (95%)", tone: "purple" },
        { id: "ch2", label: "Attendance (Optional)", tone: "cyan" },
        { id: "ch3", label: "Fees ($0)", tone: "green" },
      ],
      rawQuotes: [
        {
          id: "q1",
          source: "SET (anonymous)",
          text: "Lectures are dense but the podcasts are a lifesaver for review.",
        },
        {
          id: "q2",
          source: "Reddit r/UCSD",
          text: "Midterm was exactly like the discussion worksheet combo pack.",
        },
        {
          id: "q3",
          source: "RateMyProf",
          text: "Tough exams but generous curve if you show work on partial credit.",
        },
      ],
      conflict: {
        title: "Source mismatch",
        detail:
          "Reddit threads claim “no podcast,” but the 2025 syllabus lists HyFlex capture for this lecture hall.",
      },
    },
    {
      id: "c2",
      courseCode: "CSE 123",
      courseTitle: "Computer Networks",
      professorName: "Voelker",
      professorInitials: "GV",
      condensedSummary: [
        "Projects are the grade driver—start P1 early to avoid socket debugging debt.",
        "Quizzes pull from lecture clicker questions almost verbatim.",
        "Read the RFC excerpts assigned; exam short answers reference them directly.",
      ],
      tldr:
        "Project-heavy networks class with clear rubrics. Voelker’s staff emphasizes incremental commits; the autograder is strict on timeouts and edge cases.",
      confidencePercent: 81,
      chips: [
        { id: "ch4", label: "Heavy Projects", tone: "purple" },
        { id: "ch5", label: "Lecture Attendance (tracked)", tone: "cyan" },
        { id: "ch6", label: "Textbook optional", tone: "muted" },
      ],
      rawQuotes: [
        {
          id: "q4",
          source: "SET",
          text: "Projects take longer than the writeup suggests—budget weekends.",
        },
        {
          id: "q5",
          source: "Reddit",
          text: "Autograder errors are usually MTU or buffer size—check Piazza megathread.",
        },
      ],
    },
    {
      id: "c3",
      courseCode: "DSC 102",
      courseTitle: "Systems for Scalable Analytics",
      professorName: "Nguyen",
      professorInitials: "TN",
      condensedSummary: [
        "Spark grading is picky on partition logic—use the provided cluster configs.",
        "Late policy is firm; extensions only via documented DSP.",
        "Final integrates a pipeline from prior homeworks—keep your notebooks clean.",
      ],
      tldr:
        "Data systems course with weekly labs. Staff publishes reference DAGs; follow their folder layout to avoid autograder path issues.",
      confidencePercent: 76,
      chips: [
        { id: "ch7", label: "Labs (weekly)", tone: "cyan" },
        { id: "ch8", label: "Podcast N/A", tone: "muted" },
        { id: "ch9", label: "Exam (take-home)", tone: "green" },
      ],
      rawQuotes: [
        {
          id: "q6",
          source: "SET",
          text: "Labs are long but fair if you start before Thursday.",
        },
      ],
    },
    {
      id: "c4",
      courseCode: "MATH 109",
      courseTitle: "Mathematical Reasoning",
      professorName: "Eggers",
      professorInitials: "JE",
      condensedSummary: [
        "Proofs on homework mirror exam structure—memorize lemma templates.",
        "Discussion is not optional if you’re new to proof writing.",
        "Gradescope regrade window is 48h—use it for partial credit clarity.",
      ],
      tldr:
        "Intro proofs with weekly written assignments. Eggers emphasizes clarity over cleverness; office hours help unblock notation issues early.",
      confidencePercent: 92,
      chips: [
        { id: "ch10", label: "Discussion required", tone: "cyan" },
        { id: "ch11", label: "No midterm", tone: "green" },
        { id: "ch12", label: "Weekly quizzes", tone: "purple" },
      ],
      rawQuotes: [
        {
          id: "q7",
          source: "SET",
          text: "If you’ve never written proofs, start homework the day it drops.",
        },
      ],
    },
  ],
  evaluation: {
    fitnessScore: 7.4,
    fitnessMax: 10,
    trendLabel: "Manageable with constraints",
    alerts: [
      {
        id: "a1",
        severity: "critical",
        title: "Campus gap risk",
        detail:
          "Muir → Warren with only 10 minutes between CSE 120 and MATH 109 is unrealistic on foot (≈18–22 min).",
      },
      {
        id: "a2",
        severity: "warning",
        title: "Crunch week",
        detail:
          "Week 6 stacks CSE 123 project checkpoint, DSC 102 lab, and a Math 109 quiz—plan buffer now.",
      },
      {
        id: "a3",
        severity: "info",
        title: "Workload vs employment",
        detail:
          "With 20h/week job + commute, four technicals is viable if you protect Sunday blocks for CSE 123.",
      },
    ],
  },
  terminalScript: [
    "[System]: Ingestion job queued (WebReg HTML + 1 syllabus PDF).",
    "[Agent]: Parsing WebReg table view → 4 enrolled courses detected.",
    "[Agent]: Scraping SETs for Prof. Pasquale (CSE 120)...",
    "[Agent]: Reddit dork: site:reddit.com/r/ucsd \"CSE 120\" \"Pasquale\"",
    "[Agent]: Cross-referencing podcast logs (DLH 2201, last 3 quarters).",
    "[Agent]: Conflict detected: Reddit (no podcast) vs Syllabus (HyFlex).",
    "[Agent]: Conflict resolved → weight syllabus + registrar notes higher.",
    "[Agent]: Building dossiers for CSE 123, DSC 102, MATH 109...",
    "[System]: Schedule fitness model running (commute + job hours on file).",
    "[System]: Ready. Dashboard unlocked.",
  ],
};
