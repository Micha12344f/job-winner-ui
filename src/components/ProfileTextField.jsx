import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import CopyButton from './CopyButton';

// Profile field with a copy button inside it.
const ProfileTextField = ({ id, label, value, onChange, maxLength }) => (
  <TextField
    id={id}
    name={id}
    label={label}
    fullWidth
    variant="outlined"
    value={value}
    onChange={onChange}
    slotProps={{
      htmlInput: maxLength ? { maxLength } : undefined,
      input: {
        endAdornment: (
          <InputAdornment position="end">
            <CopyButton text={value} />
          </InputAdornment>
        ),
      },
    }}
  />
);

export default ProfileTextField;
