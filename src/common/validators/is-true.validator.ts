import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// Sprint A — Task 4.1: PDPL consent gate. Used by RegisterDto.acceptTerms
// to enforce "must be true" — a `@IsBoolean()` field still accepts `false`,
// which is exactly what we do NOT want for consent capture.
export function IsTrue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTrue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return value === true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be true`;
        },
      },
    });
  };
}
