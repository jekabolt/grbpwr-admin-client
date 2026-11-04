// The old print address. A QR on paper still points here, so it stays alive and opens the print
// modal on the card's labels tab.
import { Navigate, useParams } from 'react-router-dom';

export function TechCardCareLabelsRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/tech-cards/${id}?tab=labels&print=1`} replace />;
}
