import { Tag } from 'antd';

const presets = {
  'Cancelled': 'red',
  'Rejected': 'red',
  'Pending': 'orange',
  'Approved': 'green',
  'In Progress': 'lime',
  'Processed': 'green',
  'Scheduled': 'blue',
  'On Hold': 'geekblue',
  'Draft': 'white',
} as const;

interface PillProps {
  variant: keyof typeof presets;
}
export default function Pill({ variant }: PillProps) {
  return (
  <>
    <Tag variant="outlined" color={presets[variant]}>
      {variant}
    </Tag>
  </>
);
}