import { useId } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

// Free-text category picker: the API's existing categories plus the built-in
// suggestions, but the user can always type a new one. Keeps the text field's
// label wired to an id so tests and assistive tech can find it.
export default function DocumentCategoryField({
  value,
  onChange,
  suggestions = [],
  label,
  helperText,
  required = false,
  size = 'small',
}) {
  const generatedId = useId();
  const inputId = `document-category-${generatedId}`;

  return (
    <Autocomplete
      id={inputId}
      freeSolo
      autoSelect
      options={suggestions}
      value={value}
      onChange={(event, next) => onChange(next ?? '')}
      onInputChange={(event, next, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(next);
      }}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          helperText={helperText}
          required={required}
          size={size}
        />
      )}
    />
  );
}
