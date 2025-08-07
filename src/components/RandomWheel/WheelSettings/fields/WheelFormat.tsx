import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useFormContext, useWatch } from 'react-hook-form';

import RadioButtonGroup, { Option } from '@components/RadioButtonGroup/RadioButtonGroup.tsx';
import { WheelFormat } from '@constants/wheel.ts';
import '@components/RandomWheel/WheelSettings/fields/WheelFormat.scss';

const WheelFormatField = () => {
  const { t } = useTranslation();

  const wheelOptions: Option<WheelFormat>[] = useMemo(
    () => [
      { key: WheelFormat.Default, label: t('wheel.format.normal') },
      { key: WheelFormat.Dropout, label: t('wheel.format.dropout') },
      // BattleRoyal hidden per request
    ],
    [t],
  );

  // Ensure saved/legacy value like BattleRoyal is coerced to Default
  const { setValue } = useFormContext<Wheel.Settings>();
  const currentFormat = useWatch<Wheel.Settings>({ name: 'format' });
  useEffect(() => {
    const allowed = new Set(wheelOptions.map((o) => o.key));
    if (!allowed.has(currentFormat)) {
      setValue('format', WheelFormat.Default, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    }
  }, [currentFormat, setValue, wheelOptions]);

  return (
    <Controller
      render={({ field: { onChange, value }, formState: { isSubmitting } }) => (
        <RadioButtonGroup
          className='wheel-format-field'
          fullWidth
          options={wheelOptions}
          activeKey={value}
          onChangeActive={onChange}
          disabled={isSubmitting}
        />
      )}
      name='format'
    />
  );
};

export default WheelFormatField;
