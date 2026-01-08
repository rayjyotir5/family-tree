import familyData from '../../../../../public/family-tree.json';
import EditPersonClient from './EditPersonClient';

// Generate static params for all individuals at build time
export function generateStaticParams() {
  const ids = Object.keys(familyData.individuals);
  return [
    { id: 'new' },
    ...ids.map((id) => ({ id }))
  ];
}

export default function EditPersonPage() {
  return <EditPersonClient />;
}
