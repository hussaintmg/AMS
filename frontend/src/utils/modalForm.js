/**
 * A dialog's own submit, kept inside the dialog.
 *
 * `submit` bubbles, and React dispatches it along the React tree — so a form
 * inside a dialog that was opened from another form hands its submit to that
 * form as well. That is how "+ Create Source" inside the New Customer form,
 * opened in turn from the New Appointment form, saved the appointment and shut
 * the screen the moment the source was created: to the operator, the page
 * simply refreshed and the work was gone.
 *
 * Every modal form goes through here. It is never right for a dialog's Create
 * button to also press Save on whatever is behind it.
 *
 *   <form onSubmit={modalSubmit(handleSubmit)}>
 *
 * The handler is still called with the event, and may call `preventDefault`
 * again harmlessly — both are already done by the time it runs.
 */
export const modalSubmit = (handler) => (event) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  return handler?.(event);
};

export default modalSubmit;
