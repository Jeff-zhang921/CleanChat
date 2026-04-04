import { useTranslation } from "react-i18next";
import {
  GENDER_OPTIONS,
  type GenderValue,
} from "../utils/gender";
import "./GenderPicker.css";

type GenderPickerProps = {
  value: GenderValue;
  onChange: (gender: GenderValue) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
};

const GenderPicker = ({
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: GenderPickerProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={`gender-picker${className ? ` ${className}` : ""}`}
      role="radiogroup"
      aria-label={ariaLabel ?? t("gender.pickerAria")}
    >
      {GENDER_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(option.ariaKey)}
            className={`gender-picker-option${active ? " is-active" : ""}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            <span aria-hidden="true">{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
};

export default GenderPicker;
