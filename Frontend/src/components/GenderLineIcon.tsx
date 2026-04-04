import { type GenderValue } from "../utils/gender";

type GenderLineIconProps = {
  gender: GenderValue;
  className?: string;
  size?: number;
};

const GenderLineIcon = ({ gender, className, size = 18 }: GenderLineIconProps) => {
  if (gender === "male") {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="10" cy="14" r="4.75" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13.3 10.7L19 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15.6 5H19V8.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (gender === "female") {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="8.75" r="4.75" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 13.5V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8.8 16.8H15.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (gender === "non_binary") {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7.5V3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M9.5 6.1L12 3.6L14.5 6.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 16.2V20.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M9.3 18.3H14.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 12H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

export default GenderLineIcon;