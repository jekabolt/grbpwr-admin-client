import {
  common_SupportTicket,
  common_SupportTicketPriority,
  common_SupportTicketStatus,
} from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import {
  formatPriorityLabel,
  formatStatusLabel,
  getPriorityColor,
  getStatusColor,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  useTicketById,
  useUpdateTicket,
  useUpdateTicketStatus,
} from './utils';

interface TicketDetailProps {
  ticket: common_SupportTicket;
  onClose: () => void;
}

export function TicketDetail({ ticket, onClose }: TicketDetailProps) {
  // `ticket` is a one-time row snapshot from the list click; refetch by id so a successful save
  // (which only invalidates the list query) is reflected here too, instead of leaving the
  // Update/Save buttons stuck "on" against stale local state.
  const { data } = useTicketById(ticket.id ?? null);
  const currentTicket = data?.ticket ?? ticket;
  const insert = currentTicket.supportTicketInsert;
  const updateStatus = useUpdateTicketStatus();
  const updateTicket = useUpdateTicket();

  const [status, setStatus] = useState<common_SupportTicketStatus>(
    currentTicket.status ?? 'SUPPORT_TICKET_STATUS_SUBMITTED',
  );
  const [priority, setPriority] = useState<common_SupportTicketPriority>(
    currentTicket.priority ?? 'SUPPORT_TICKET_PRIORITY_MEDIUM',
  );
  const [category, setCategory] = useState(currentTicket.category ?? '');
  const [internalNotes, setInternalNotes] = useState(currentTicket.internalNotes ?? '');

  const statusChanged = status !== currentTicket.status;
  const detailsChanged =
    priority !== currentTicket.priority ||
    category !== (currentTicket.category ?? '') ||
    internalNotes !== (currentTicket.internalNotes ?? '');

  const handleSaveStatus = () => {
    if (!currentTicket.id) return;
    updateStatus.mutate({
      id: currentTicket.id,
      status,
      internalNotes: internalNotes || undefined,
    });
  };

  const handleSaveDetails = () => {
    if (!currentTicket.id) return;
    updateTicket.mutate({
      id: currentTicket.id,
      priority,
      category: category || undefined,
      internalNotes: internalNotes || undefined,
    });
  };

  return (
    <div className='flex flex-col gap-6 p-4 border border-textInactiveColor bg-bgColor'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          ticket #{currentTicket.id} &mdash; {currentTicket.caseNumber}
        </Text>
        <Button variant='secondary' size='lg' onClick={onClose}>
          Close
        </Button>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* Customer info */}
        <div className='flex flex-col gap-3 border border-textInactiveColor p-4'>
          <Text variant='uppercase' size='default'>
            Customer Information
          </Text>
          <InfoRow
            label='Name'
            value={`${insert?.civility ?? ''} ${insert?.firstName ?? ''} ${insert?.lastName ?? ''}`.trim()}
          />
          <InfoRow label='Email' value={insert?.email} />
          <InfoRow
            label='Order Ref'
            value={insert?.orderReference}
            href={
              insert?.orderReference
                ? `${ROUTES.orders}?ref=${encodeURIComponent(insert.orderReference)}`
                : undefined
            }
          />
          <InfoRow label='Topic' value={insert?.topic} />
          <InfoRow label='Subject' value={insert?.subject} />
          <InfoRow label='Customer Category' value={insert?.category} />
          <InfoRow label='Customer Priority' value={formatPriorityLabel(insert?.priority)} />
          {insert?.notes && (
            <div className='flex flex-col gap-1'>
              <Text variant='inactive' size='small'>
                Customer Notes
              </Text>
              <div className='p-2 border border-textInactiveColor bg-white whitespace-pre-wrap'>
                <Text>{insert.notes}</Text>
              </div>
            </div>
          )}
        </div>

        {/* Ticket management */}
        <div className='flex flex-col gap-3 border border-textInactiveColor p-4'>
          <Text variant='uppercase' size='default'>
            Ticket Management
          </Text>

          <InfoRow label='Created' value={formatDateShort(currentTicket.createdAt, true)} />
          <InfoRow label='Updated' value={formatDateShort(currentTicket.updatedAt, true)} />
          <InfoRow label='Resolved' value={formatDateShort(currentTicket.resolvedAt, true)} />

          <div className='flex flex-col gap-1 mt-2'>
            <Text variant='inactive' size='small'>
              Status
            </Text>
            <div className='flex gap-2 items-center'>
              <span className={`inline-block px-2 py-0.5 ${getStatusColor(currentTicket.status)}`}>
                <Text>{formatStatusLabel(currentTicket.status)}</Text>
              </span>
              <Text variant='inactive'>&rarr;</Text>
              <Selector
                label='Status'
                options={STATUS_OPTIONS}
                value={status}
                onChange={(v: string) => setStatus(v as common_SupportTicketStatus)}
              />
              {statusChanged && (
                <Button
                  variant='main'
                  size='lg'
                  onClick={handleSaveStatus}
                  loading={updateStatus.isPending}
                >
                  Update Status
                </Button>
              )}
            </div>
          </div>

          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Priority
            </Text>
            <div className='flex gap-2 items-center'>
              <span
                className={`inline-block px-2 py-0.5 ${getPriorityColor(currentTicket.priority)}`}
              >
                <Text>{formatPriorityLabel(currentTicket.priority)}</Text>
              </span>
              <Text variant='inactive'>&rarr;</Text>
              <Selector
                label='Priority'
                options={PRIORITY_OPTIONS}
                value={priority}
                onChange={(v: string) => setPriority(v as common_SupportTicketPriority)}
              />
            </div>
          </div>

          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Category
            </Text>
            <input
              type='text'
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder='e.g. shipping, billing, product'
              className='w-full border-b border-textInactiveColor bg-bgColor text-textBaseSize focus:outline-none'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Internal Notes
            </Text>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={4}
              className='w-full resize-none border border-textInactiveColor bg-bgColor p-2 text-textBaseSize focus:outline-none'
            />
          </div>

          {detailsChanged && (
            <Button
              variant='main'
              size='lg'
              onClick={handleSaveDetails}
              loading={updateTicket.isPending}
            >
              Save Changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string | undefined;
  href?: string;
}) {
  return (
    <div className='flex gap-2'>
      <Text variant='inactive' size='small' className='min-w-28 shrink-0'>
        {label}
      </Text>
      {href ? (
        <Link to={href} className='underline underline-offset-2 hover:opacity-70'>
          <Text size='small'>{value}</Text>
        </Link>
      ) : (
        <Text size='small'>{value || '-'}</Text>
      )}
    </div>
  );
}
