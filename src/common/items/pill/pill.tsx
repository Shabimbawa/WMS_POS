import { Tag } from 'antd';
import { useLanguage } from '../../context/language-context';

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
  const { t } = useLanguage();
  return (
  <>
    <Tag variant="outlined" color={presets[variant]}>
      {t(variant)}
    </Tag>
  </>
);
}
