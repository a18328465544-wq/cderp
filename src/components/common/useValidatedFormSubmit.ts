import {useEffect, useRef, useState, type FormEventHandler} from "react";
import type {FieldValues, SubmitErrorHandler, UseFormReturn} from "react-hook-form";
import {createFormSubmissionGuard} from "@/src/lib/formSubmissionGuard";

interface ValidatedFormSubmitOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  enabled: boolean;
  /** A fresh identity whenever an editor is reset, closed or reopened. */
  scope: string;
  getScope: () => string;
  canSubmit: () => boolean;
  onSubmit: (values: T) => Promise<void>;
  onInvalid?: SubmitErrorHandler<T>;
}

/** A validation result can submit only the unchanged editor that requested it. */
export function useValidatedFormSubmit<T extends FieldValues>(options: ValidatedFormSubmitOptions<T>) {
  const latest = useRef(options);
  latest.current = options;
  const [guard] = useState(createFormSubmissionGuard);
  const mounted = useRef(true);
  const [state, setState] = useState({scope: options.scope, validating: false, feedback: ""});
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false; guard.invalidate();};
  }, [guard]);

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const current = latest.current;
    if (!current.enabled || !current.canSubmit()) return;
    const scope = current.getScope();
    const ticket = guard.begin(scope, current.form.getValues());
    if (!ticket) return;
    setState({scope, validating: true, feedback: ""});
    const stillOwnsEditor = () => mounted.current && latest.current.enabled && guard.owns(ticket, latest.current.getScope());
    const feedback = (message: string) => {if (stillOwnsEditor()) setState({scope, validating: true, feedback: message});};
    void (async () => {
      try {
        await current.form.handleSubmit(async (values) => {
          if (!stillOwnsEditor()) return;
          if (!guard.canCommit(ticket, latest.current.getScope(), latest.current.form.getValues())) {
            feedback("内容已更新，请再次保存。当前输入和图片已保留。");
            return;
          }
          if (!latest.current.canSubmit()) {
            feedback("请处理图片状态后再次保存。当前内容已保留。");
            return;
          }
          await latest.current.onSubmit(values);
        }, (errors, invalidEvent) => {
          if (!stillOwnsEditor()) return;
          if (!guard.canCommit(ticket, latest.current.getScope(), latest.current.form.getValues())) {
            feedback("内容已更新，请再次保存。当前输入和图片已保留。");
            return;
          }
          return latest.current.onInvalid?.(errors, invalidEvent);
        })();
      } catch (error) {
        // Callers retain their mutation error UI. Also catch the returned RHF
        // promise so an API failure never becomes an unhandled rejection.
        feedback(error instanceof Error ? error.message : "保存失败，请稍后重试。");
      } finally {
        // Release kept-alive pages while hidden, without clearing a new editor's lock.
        const sameEditor = mounted.current && ticket.scope === latest.current.getScope();
        if (guard.finish(ticket) && sameEditor) setState((previous) => ({...previous, validating: false}));
      }
    })();
  };
  const visible = options.enabled && state.scope === options.scope;
  const clearFeedback = () => setState((previous) => ({...previous, feedback: ""}));
  return {onSubmit, validating: visible && state.validating, feedback: visible ? state.feedback : "", clearFeedback};
}
