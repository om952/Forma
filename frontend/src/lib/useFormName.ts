import { useEffect, useState } from "react";

import { apiJson } from "./api";

/**
 * The form's name, for pages that don't otherwise load the form (analytics,
 * webhooks). Undefined until it arrives, or if it can't be read: the name is
 * a label, so a failure here is not worth an error of its own.
 */
export const useFormName = (formId: string, token: string | null | undefined) => {
  const [name, setName] = useState<string>();

  useEffect(() => {
    if (!formId || !token) return;
    let cancelled = false;
    apiJson<{ name: string }>(`/api/forms/${formId}`, { token })
      .then((form) => {
        if (!cancelled) setName(form.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [formId, token]);

  return name;
};
