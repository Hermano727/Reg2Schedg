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
        { id: "ch1", label: "Podcasted (95% coverage)", tone: "purple" },
        { id: "ch2", label: "Optional attendance", tone: "green" },
        { id: "ch3", label: "Partial credit on exams", tone: "cyan" },
      ],
      logistics: {
        attendance_required: false,
        grade_breakdown: "30% Homework, 30% Midterm, 40% Final",
        course_webpage_url: null,
        textbook_required: true,
        podcasts_available: true,
        student_sentiment_summary: null,
        rate_my_professor: {
          rating: 4.2,
          would_take_again_percent: 78,
          difficulty: 3.8,
          url: null,
        },
      },
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
          "Reddit threads claim 'no podcast,' but the 2025 syllabus lists HyFlex capture for this lecture hall.",
      },
      meetings: [
        { section_type: "Lecture", days: "MWF", start_time: "10:00 AM", end_time: "10:50 AM", location: "PETER 108" },
        { section_type: "Discussion", days: "Tu", start_time: "5:00 PM", end_time: "5:50 PM", location: "CSE 2154" },
      ],
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
        { id: "ch4", label: "Project-heavy grading", tone: "purple" },
        { id: "ch5", label: "Attendance tracked via iClicker", tone: "cyan" },
        { id: "ch6", label: "Textbook optional", tone: "muted" },
      ],
      logistics: {
        attendance_required: true,
        grade_breakdown: "50% Projects, 20% Quizzes, 30% Final",
        course_webpage_url: null,
        textbook_required: false,
        podcasts_available: false,
        student_sentiment_summary: null,
        rate_my_professor: {
          rating: 3.9,
          would_take_again_percent: 65,
          difficulty: 4.1,
          url: null,
        },
      },
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
      meetings: [
        { section_type: "Lecture", days: "TuTh", start_time: "2:00 PM", end_time: "3:20 PM", location: "CSE 1202" },
        { section_type: "Discussion", days: "F", start_time: "1:00 PM", end_time: "1:50 PM", location: "CSE 4140" },
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
        { id: "ch7", label: "Weekly labs", tone: "cyan" },
        { id: "ch8", label: "No recordings", tone: "muted" },
        { id: "ch9", label: "Take-home final exam", tone: "green" },
      ],
      rawQuotes: [
        {
          id: "q6",
          source: "SET",
          text: "Labs are long but fair if you start before Thursday.",
        },
      ],
      meetings: [
        { section_type: "Lecture", days: "MWF", start_time: "12:00 PM", end_time: "12:50 PM", location: "WLH 2005" },
        { section_type: "Lab", days: "W", start_time: "2:00 PM", end_time: "2:50 PM", location: "B230" },
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
        { id: "ch10", label: "Discussion attendance required", tone: "cyan" },
        { id: "ch11", label: "No midterm — weekly quizzes only", tone: "green" },
        { id: "ch12", label: "Gradescope 48h regrade window", tone: "purple" },
      ],
      rawQuotes: [
        {
          id: "q7",
          source: "SET",
          text: "If you’ve never written proofs, start homework the day it drops.",
        },
      ],
      meetings: [
        { section_type: "Lecture", days: "MWF", start_time: "11:00 AM", end_time: "11:50 AM", location: "APM 7421" },
        { section_type: "Discussion", days: "Th", start_time: "7:00 PM", end_time: "7:50 PM", location: "APM 2402" },
      ],
    },
  ],
  evaluation: {
    fitnessScore: 7.4,
    fitnessMax: 10,
    trendLabel: "Manageable with constraints",
    categories: [
      {
        label: "Campus Flow",
        score: 5.5,
        max: 10,
        color: "#00d4ff",
        detail: "One transition is physically unrealistic without leaving class early",
      },
      {
        label: "Workload",
        score: 7.5,
        max: 10,
        color: "#f59e0b",
        detail: "Four technical courses is heavy but achievable with consistent pacing",
      },
      {
        label: "Time Spread",
        score: 8.0,
        max: 10,
        color: "#a78bfa",
        detail: "Classes are distributed across the week with reasonable breathing room",
      },
      {
        label: "Life Balance",
        score: 8.5,
        max: 10,
        color: "#34d399",
        detail: "Work shifts carry enough buffer around class times to avoid conflicts",
      },
    ],
    alerts: [
      {
        id: "a1",
        severity: "critical",
        title: "Campus gap risk",
        detail:
          "CSE 120 ends at 10:50 AM near Warren, and MATH 109 starts at 11:00 AM at APM. Walking between those two buildings takes roughly 18–22 minutes, so you will arrive 8–12 minutes late unless you leave the CSE 120 lecture a few minutes early.",
      },
      {
        id: "a2",
        severity: "warning",
        title: "Crunch week",
        detail:
          "Week 6 stacks a CSE 123 project checkpoint, a DSC 102 lab deadline, and a MATH 109 quiz all within a 72-hour window. None of those overlap in time, but they share the same study bandwidth. Block out the preceding weekend now.",
      },
      {
        id: "a3",
        severity: "info",
        title: "Workload vs employment",
        detail:
          "At 20 hours of work per week alongside four technical courses, the schedule is viable — but only if you treat Sunday as protected study time, particularly for the CSE 123 project. Losing one weekend to unplanned commitments can set off a chain reaction heading into Week 6.",
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
scheduleItems: [
  {
    id: "s1",
    title: "CSE 120 Lecture",
    kind: "class",
    day: "Tue",
    start: "12:30",
    end: "13:50",
    location: "Muir",
    zone: "Muir",
    buildingCode: "MUIR",
  },
  {
    id: "s2",
    title: "MATH 109 Discussion",
    kind: "class",
    day: "Tue",
    start: "14:00",
    end: "14:50",
    location: "Center Hall",
    zone: "Central",
    buildingCode: "CENTR",
  },
  {
    id: "s3",
    title: "Work Shift",
    kind: "work",
    day: "Tue",
    start: "15:20",
    end: "18:00",
    location: "UTC",
    zone: "Off Campus",
    buildingCode: "UTC",
  },
  {
    id: "s4",
    title: "Gym Session",
    kind: "personal",
    day: "Thu",
    start: "18:15",
    end: "19:00",
    location: "RIMAC",
    zone: "RIMAC",
  },
],
transitionInsights: [
  {
    id: "t1",
    fromId: "s1",
    toId: "s2",
    walkMinutes: 9,
    gapMinutes: 10,
    risk: "tight",
    detail: "The gap is technically enough, but only if you pack up and leave the moment class ends. Any lingering — questions for the professor, a slow exit row — puts you late to discussion.",
  },
  {
    id: "t2",
    fromId: "s2",
    toId: "s3",
    walkMinutes: 18,
    gapMinutes: 30,
    risk: "safe",
    detail: "The 30-minute window is comfortable. You have time to walk to UTC, grab water, and get settled before your shift begins.",
  },
],
};


