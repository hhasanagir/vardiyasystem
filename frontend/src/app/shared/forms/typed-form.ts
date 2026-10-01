import { FormControl, FormGroup, FormArray, ValidatorFn, AsyncValidatorFn } from '@angular/forms';

type ControlsOf<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends Array<infer U> ? FormArray<FormControl<U>> : FormControl<T[K]>;
};

export function typedFormGroup<T extends Record<string, any>>(
  controls: { [K in keyof T]: FormControl<T[K]> },
  validators?: ValidatorFn | ValidatorFn[] | null,
  asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[] | null,
): FormGroup<ControlsOf<T>> {
  return new FormGroup(controls as ControlsOf<T>, validators, asyncValidators);
}

export function typedFormControl<T>(
  value: T,
  validators?: ValidatorFn | ValidatorFn[] | null,
  asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[] | null,
): FormControl<T> {
  return new FormControl(value, { validators, asyncValidators }) as FormControl<T>;
}

export function typedFormArray<T>(
  controls: FormControl<T>[],
  validators?: ValidatorFn | ValidatorFn[] | null,
): FormArray<FormControl<T>> {
  return new FormArray(controls, validators);
}
