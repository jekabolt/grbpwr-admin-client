import {
  common_SupportTicket,
  common_SupportTicketPriority,
  common_SupportTicketStatus,
} from 'api/proto-http/admin';
import { useState } from 'react';
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
  useUpdateTicket,
  useUpdateTicketStatus,
} from './utils';

interface TicketDetailProps {
  ticket: common_SupportTicket;
  onClose: () => void;
}

export function TicketDetail({ ticket, onClose }: TicketDetailProps) {
  const insert = ticket.supportTicketInsert;
  const updateStatus = useUpdateTicketStatus();
  const updateTicket = useUpdateTicket();

  const [status, setStatus] = useState<common_SupportTicketStatus>(
    ticket.status ?? 'SUPPORT_TICKET_STATUS_SUBMITTED',
  );
  const [priority, setPriority] = useState<common_SupportTicketPriority>(
    ticket.priority ?? 'SUPPORT_TICKET_PRIORITY_MEDIUM',
  );
  const [category, setCategory] = useState(ticket.category ?? '');
  const [internalNotes, setInternalNotes] = useState(ticket.internalNotes ?? '');

  const statusChanged = status !== ticket.status;
  const detailsChanged =
    priority !== ticket.priority ||
    category !== (ticket.category ?? '') ||
    internalNotes !== (ticket.internalNotes ?? '');

  const handleSaveStatus = () => {
    if (!ticket.id) return;
    updateStatus.mutate({
      id: ticket.id,
      status,
      internalNotes: internalNotes || undefined,
    });
  };

  const handleSaveDetails = () => {
    if (!ticket.id) return;
    updateTicket.mutate({
      id: ticket.id,
      priority,
      category: category || undefined,
      internalNotes: internalNotes || undefined,
    });
  };

  return (
    <div className='flex flex-col gap-6 p-4 border border-textColor bg-bgColor'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          ticket #{ticket.id} &mdash; {ticket.caseNumber}
        </Text>
        <Button variant='secondary' size='lg' onClick={onClose}>
          Close
        </Button>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* Customer info */}
        <div className='flex flex-col gap-3 border border-textColor p-4'>
          <Text variant='uppercase' size='default'>
            Customer Information
          </Text>
          <InfoRow label='Name' value={`${insert?.civility ?? ''} ${insert?.firstName ?? ''} ${insert?.lastName ?? ''}`.trim()} />
          <InfoRow label='Email' value={insert?.email} />
          <InfoRow label='Order Ref' value={insert?.orderReference} />
          <InfoRow label='Topic' value={insert?.topic} />
          <InfoRow label='Subject' value={insert?.subject} />
          <InfoRow label='Customer Category' value={insert?.category} />
          <InfoRow label='Customer Priority' value={formatPriorityLabel(insert?.priority)} />
          {insert?.notes && (
            <div className='flex flex-col gap-1'>
              <Text variant='inactive' size='small'>
                Customer Notes
              </Text>
              <div className='p-2 border border-textColor bg-white whitespace-pre-wrap'>
                <Text>{insert.notes}</Text>
              </div>
            </div>
          )}
        </div>

        {/* Ticket management */}
        <div className='flex flex-col gap-3 border border-textColor p-4'>
          <Text variant='uppercase' size='default'>
            Ticket Management
          </Text>

          <InfoRow label='Created' value={formatDateShort(ticket.createdAt, true)} />
          <InfoRow label='Updated' value={formatDateShort(ticket.updatedAt, true)} />
          <InfoRow label='Resolved' value={formatDateShort(ticket.resolvedAt, true)} />

          <div className='flex flex-col gap-1 mt-2'>
            <Text variant='inactive' size='small'>
              Status
            </Text>
            <div className='flex gap-2 items-center'>
              <span className={`inline-block px-2 py-0.5 ${getStatusColor(ticket.status)}`}>
                <Text>{formatStatusLabel(ticket.status)}</Text>
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
              <span className={`inline-block px-2 py-0.5 ${getPriorityColor(ticket.priority)}`}>
                <Text>{formatPriorityLabel(ticket.priority)}</Text>
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
              className='w-full border-b border-textColor bg-bgColor text-textBaseSize focus:outline-none'
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
              className='w-full resize-none border border-textColor bg-bgColor p-2 text-textBaseSize focus:outline-none'
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

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className='flex gap-2'>
      <Text variant='inactive' size='small' className='min-w-28 shrink-0'>
        {label}
      </Text>
      <Text size='small'>{value || '-'}</Text>
    </div>
  );
}
