"use client";

import { useCallback, useEffect, useReducer, useMemo, useRef } from "react";
import type { ClassDossier, ScheduleCommitment } from "@/types/dossier";

export type ScheduleSnapshot = {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
};

type EditorState = ScheduleSnapshot & {
  baseline: ScheduleSnapshot;
  past: ScheduleSnapshot[];
  future: ScheduleSnapshot[];
};

function cloneSnap(s: ScheduleSnapshot): ScheduleSnapshot {
  return {
    classes: structuredClone(s.classes),
    commitments: structuredClone(s.commitments),
  };
}

type Action =
  | { type: "HYDRATE"; payload: { classes: ClassDossier[] } }
  | { type: "APPLY"; payload: ScheduleSnapshot }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" }
  | { type: "ADD_COMMITMENT"; payload: ScheduleCommitment }
  | { type: "REMOVE_COMMITMENT"; payload: { id: string } }
  | { type: "EDIT_COMMITMENT"; payload: ScheduleCommitment };

function reducer(state: EditorState, action: Action): EditorState {
  const present: ScheduleSnapshot = {
    classes: state.classes,
    commitments: state.commitments,
  };

  switch (action.type) {
    case "HYDRATE": {
      const classes = structuredClone(action.payload.classes);
      const commitments: ScheduleCommitment[] = [];
      const baseline = { classes: structuredClone(classes), commitments: [] };
      return {
        classes,
        commitments,
        baseline,
        past: [],
        future: [],
      };
    }
    case "APPLY": {
      return {
        ...state,
        past: [...state.past, cloneSnap(present)],
        future: [],
        classes: structuredClone(action.payload.classes),
        commitments: structuredClone(action.payload.commitments),
      };
    }
    case "ADD_COMMITMENT": {
      return {
        ...state,
        past: [...state.past, cloneSnap(present)],
        future: [],
        commitments: [...state.commitments, action.payload],
      };
    }
    case "REMOVE_COMMITMENT": {
      return {
        ...state,
        past: [...state.past, cloneSnap(present)],
        future: [],
        commitments: state.commitments.filter((c) => c.id !== action.payload.id),
      };
    }
    case "EDIT_COMMITMENT": {
      return {
        ...state,
        past: [...state.past, cloneSnap(present)],
        future: [],
        commitments: state.commitments.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        classes: structuredClone(prev.classes),
        commitments: structuredClone(prev.commitments),
        past: state.past.slice(0, -1),
        future: [cloneSnap(present), ...state.future],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        classes: structuredClone(next.classes),
        commitments: structuredClone(next.commitments),
        past: [...state.past, cloneSnap(present)],
        future: state.future.slice(1),
      };
    }
    case "RESET": {
      return {
        ...state,
        past: [...state.past, cloneSnap(present)],
        future: [],
        classes: structuredClone(state.baseline.classes),
        commitments: structuredClone(state.baseline.commitments),
      };
    }
    default:
      return state;
  }
}

function initialEditor(classes: ClassDossier[]): EditorState {
  const c = structuredClone(classes);
  return {
    classes: c,
    commitments: [],
    baseline: { classes: structuredClone(c), commitments: [] },
    past: [],
    future: [],
  };
}

export function useScheduleFingerprint(viewClasses: ClassDossier[]) {
  return useMemo(
    () =>
      viewClasses
        .map((c) =>
          JSON.stringify({
            id: c.id,
            meetings: c.meetings,
          }),
        )
        .join("\n"),
    [viewClasses],
  );
}

export function useScheduleEditor(
  viewClasses: ClassDossier[],
  hydrateKey: string,
) {
  const [state, dispatch] = useReducer(reducer, viewClasses, initialEditor);
  const viewClassesRef = useRef(viewClasses);
  viewClassesRef.current = viewClasses;

  useEffect(() => {
    dispatch({
      type: "HYDRATE",
      payload: { classes: viewClassesRef.current },
    });
  }, [hydrateKey]);

  const apply = useCallback((next: ScheduleSnapshot) => {
    dispatch({ type: "APPLY", payload: next });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const resetToBaseline = useCallback(() => dispatch({ type: "RESET" }), []);

  const addCommitment = useCallback((c: ScheduleCommitment) => {
    dispatch({ type: "ADD_COMMITMENT", payload: c });
  }, []);

  const removeCommitment = useCallback((id: string) => {
    dispatch({ type: "REMOVE_COMMITMENT", payload: { id } });
  }, []);

  const editCommitment = useCallback((c: ScheduleCommitment) => {
    dispatch({ type: "EDIT_COMMITMENT", payload: c });
  }, []);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const isDirty = useMemo(() => {
    if (state.commitments.length !== state.baseline.commitments.length)
      return true;
    return (
      JSON.stringify(state.classes) !== JSON.stringify(state.baseline.classes)
    );
  }, [state.classes, state.commitments, state.baseline]);

  return {
    classes: state.classes,
    commitments: state.commitments,
    baseline: state.baseline,
    apply,
    undo,
    redo,
    resetToBaseline,
    addCommitment,
    removeCommitment,
    editCommitment,
    canUndo,
    canRedo,
    isDirty,
  };
}
