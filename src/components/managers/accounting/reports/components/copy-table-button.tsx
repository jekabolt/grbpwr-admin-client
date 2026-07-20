import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';

type Props = {
  headers: string[];
  // Raw cell values as they should paste into a spreadsheet: amounts are the decimal `value`
  // strings (unformatted — no thousands separators/locale), so a cell stays a real number in
  // Excel/Sheets. undefined → empty cell.
  rows: (string | number | undefined)[][];
  // Reserved for a future CSV/print export (backlog item 1, 06 §Бэклог); unused by clipboard copy.
  filename?: string;
};

// TSV is tab-separated with newline rows; guard against a value that itself holds a tab/newline so
// the column grid can't drift.
function cell(v: string | number | undefined): string {
  if (v === undefined || v === null) return '';
  return String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

// "copy table" — the killer report feature before CSV export (§8.5): serialise the visible table to
// TSV and drop it on the clipboard, so an analyst pastes straight into a spreadsheet with columns
// intact. Cheap: the data is already in memory.
export function CopyTableButton({ headers, rows }: Props) {
  const { showMessage } = useSnackBarStore();

  const onCopy = () => {
    const tsv = [headers, ...rows].map((r) => r.map(cell).join('\t')).join('\n');
    navigator.clipboard
      .writeText(tsv)
      .then(() => showMessage('Table copied — paste into a spreadsheet', 'success'))
      .catch(() => showMessage('Failed to copy table', 'error'));
  };

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      className='px-3 py-1 uppercase'
      onClick={onCopy}
    >
      copy table
    </Button>
  );
}
