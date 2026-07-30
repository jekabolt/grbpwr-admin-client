import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';

// custFlow v2 — the buyer's identity, as a plain field stack under the section rule (no accordion
// stage). Name + phone moved here off the old shipping step so "who" and "where" are separate.
export function ContactFieldsGroup() {
  return (
    <div className='flex flex-col gap-4 border border-borderColor bg-bgColor p-3'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <InputField name='buyer.firstName' label='first name' />
        <InputField name='buyer.lastName' label='last name' />
        <InputField name='buyer.email' label='email' type='email' />
        <InputField name='buyer.phone' label='phone' />
      </div>
      <CheckboxField name='buyer.receivePromoEmails' label='buyer opts in to promotional emails' />
    </div>
  );
}
