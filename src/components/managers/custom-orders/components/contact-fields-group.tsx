import FieldsGroupContainer from 'ui/components/fields-group';
import InputField from 'ui/form/fields/input-field';
import ToggleField from 'ui/form/fields/toggle-field';

export function ContactFieldsGroup() {
  return (
    <FieldsGroupContainer stage='1/3' title='contact' isOpen={true}>
      <div>
        <InputField name='buyer.email' label='email' type='email' />
        <ToggleField name='buyer.receivePromoEmails' label='receive promo emails' />
      </div>
    </FieldsGroupContainer>
  );
}
