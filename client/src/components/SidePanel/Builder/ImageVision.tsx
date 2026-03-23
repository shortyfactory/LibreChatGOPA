import { Checkbox } from '@librechat/client';
import { Capabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { AssistantForm } from '~/common';
import { useLocalize } from '~/hooks';

export default function ImageVision({ disabled = false }: { disabled?: boolean }) {
  const localize = useLocalize();
  const methods = useFormContext<AssistantForm>();
  const { control, setValue, getValues } = methods;

  return (
    <div className="flex items-center">
      <Controller
        name={Capabilities.image_vision}
        control={control}
        render={({ field }) => (
          <Checkbox
            {...field}
            checked={field.value}
            disabled={disabled}
            onCheckedChange={field.onChange}
            className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
            value={field.value.toString()}
            aria-labelledby={Capabilities.image_vision}
          />
        )}
      />
      <label
        id={Capabilities.image_vision}
        className={`form-check-label text-token-text-primary w-full ${
          disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
        }`}
        htmlFor={Capabilities.image_vision}
        onClick={() => {
          if (disabled) {
            return;
          }

          setValue(Capabilities.image_vision, !getValues(Capabilities.image_vision), {
            shouldDirty: true,
          });
        }}
      >
        <div className="flex items-center">{localize('com_assistants_image_vision')}</div>
      </label>
    </div>
  );
}
