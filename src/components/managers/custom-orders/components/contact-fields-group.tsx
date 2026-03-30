import FieldsGroupContainer from 'ui/components/fields-group';
import InputField from 'ui/form/fields/input-field';

export function ContactFieldsGroup() {
  return (
    <FieldsGroupContainer stage='1/3' title='contact' isOpen={true}>
      <InputField name='buyer.email' label='email' type='email' />
    </FieldsGroupContainer>
  );
}
