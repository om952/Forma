import { create } from "zustand";

export type FieldType = "text" | "select" | "file";

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
};

type FormBuilderState = {
  schema: FormField[];
  addField: (type: FieldType) => void;
  clear: () => void;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `field_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const useFormBuilderStore = create<FormBuilderState>((set) => ({
  schema: [],
  addField: (type) =>
    set((state) => ({
      schema: [
        ...state.schema,
        {
          id: createId(),
          type,
          label:
            type === "text"
              ? "Text field"
              : type === "select"
                ? "Select field"
                : "File upload",
          required: false,
        },
      ],
    })),
  clear: () => set({ schema: [] }),
}));
