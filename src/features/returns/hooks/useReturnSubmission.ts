import {useEffect, useId, useRef, useState, type FormEventHandler} from "react";
import {createFormSubmissionGuard} from "@/src/lib/formSubmissionGuard";
import {ApiError} from "@/src/services/api";
import {notify} from "@/src/utils/notification";

interface ReturnSubmissionOptions<TValues, TResult> {
  active: boolean;
  values: TValues;
  validate: () => string | undefined;
  buildCommand: () => TValues;
  submit: (command: TValues) => Promise<TResult>;
  onSaved: (result: TResult) => void;
  onRefresh: () => void | Promise<void>;
  onAuthExpired: () => void;
  failureMessage: string;
}

/** A committed return and a failed read refresh are different outcomes. */
export function useReturnSubmission<TValues, TResult>(options: ReturnSubmissionOptions<TValues, TResult>) {
  const scope = useId();
  const latest = useRef(options);
  latest.current = options;
  const [guard] = useState(createFormSubmissionGuard);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false; guard.invalidate();};
  }, [guard]);

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const current = latest.current;
    if (!current.active) return;
    // React's pending render is not synchronous; lock before validation or I/O.
    const ticket = guard.begin(scope, current.values);
    if (!ticket) return;
    let command: TValues;
    try {
      const invalidReason = current.validate();
      if (invalidReason) {
        setError(invalidReason);
        guard.finish(ticket);
        return;
      }
      command = structuredClone(current.buildCommand());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : current.failureMessage);
      guard.finish(ticket);
      return;
    }
    setError("");
    setPending(true);
    void (async () => {
      try {
        let result: TResult;
        try {
          result = await current.submit(command);
        } catch (caught) {
          if (caught instanceof ApiError && caught.isUnauthorized) current.onAuthExpired();
          if (mounted.current && guard.canCommit(ticket, scope, latest.current.values)) {
            setError(caught instanceof Error ? caught.message : current.failureMessage);
          }
          return;
        }
        // Hidden kept-alive tabs still own a confirmed save. Closed editors do
        // not, nor does a new draft that changed while the old request ran.
        if (mounted.current && guard.canCommit(ticket, scope, latest.current.values)) {
          try {current.onSaved(result);} catch {
            notify.warning("退货单已提交，但页面状态更新失败，请刷新查看。不要重复提交。");
          }
        }
        // Do not keep the next return locked while unrelated read models refresh,
        // or report an already committed return as a failed financial write.
        void Promise.resolve().then(current.onRefresh).catch(() => {
          notify.warning("退货单已提交，但列表刷新失败，请手动刷新。不要重复提交。");
        });
      } finally {
        if (guard.finish(ticket) && mounted.current) setPending(false);
      }
    })();
  };
  return {onSubmit, pending, error};
}
