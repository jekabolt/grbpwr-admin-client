import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { common_ColorwayFull, ColorwayCostInfo } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FittingsReadonlyList } from 'components/managers/fittings/components/fittings-readonly-list';
import { ProductCustomsSection } from './customs/customs-section';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { generatePath, Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { defaultData, ProductFormData, productSchema } from '../utility/schema';
import { BodyFields } from './body-fields';
import { ProductCostSection } from './cost-section';
import { LifecycleControls, StatusBadge } from './lifecycle-controls';
import { MediaAds } from './media-ads';
import { SizeMeasurements } from './size-measurements';
import { StylePicker } from './style-picker';
import { StyleSection } from './style-section';
import { Tags } from './tags';
import { Thumbnail } from './thumbnail';
import { buildColorwayUpdateMask, buildColorwayWrite, mapProductFullToFormData } from './utils';

type Props = {
  isEditMode: boolean;
  isAddingProduct: boolean;
  isCopyMode: boolean;
  product: common_ColorwayFull | undefined;
  costInfo?: ColorwayCostInfo;
  productId?: string;
  onEditModeChange: (isEditMode: boolean) => void;
  onStockUpdated?: () => void;
};

export function ProductForm({
  isEditMode = false,
  isAddingProduct = false,
  isCopyMode,
  product,
  costInfo,
  productId,
  onEditModeChange,
  onStockUpdated,
}: Props) {
  const { showMessage } = useSnackBarStore();
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [mediaClearKey, setMediaClearKey] = useState(0);
  const editMode = isEditMode || isAddingProduct;
  const navigate = useNavigate();
  const { canWrite, canReadCosting, canWriteCosting } = usePermissions();

  const initialValues =
    product && (!isAddingProduct || isCopyMode) ? mapProductFullToFormData(product) : defaultData;

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  });

  useEffect(() => {
    setIsFormChanged(form.formState.isDirty);
  }, [form.formState.isDirty]);

  useEffect(() => {
    if (product && !isAddingProduct && !isCopyMode) {
      const values = mapProductFullToFormData(product);
      form.reset({ ...form.getValues(), sizeMeasurements: values.sizeMeasurements });
    }
  }, [product]);

  // R2/R4 write decomposition: this form owns only the colourway (merch/media/prices/tags/
  // translations/cost). Style facts save through <StyleSection/> (UpdateStyle) and the size chart /
  // stock / variants through <SizeMeasurements/>, each under its own optimistic lock.
  async function handleSubmit(data: ProductFormData) {
    const common = buildColorwayWrite(data);
    try {
      if (isAddingProduct) {
        // A colourway attaches to an existing style — there is no CreateStyle RPC (a style is a tech
        // card). Copy mode prefills styleId from the source; a from-scratch add needs it entered.
        const styleId = data.styleId ? parseInt(data.styleId, 10) : NaN;
        if (!styleId || Number.isNaN(styleId)) {
          showMessage('Enter the style (tech card) id to attach this colourway to', 'error');
          return;
        }
        const res = await adminService.CreateColorway({ styleId, ...common });
        setIsFormChanged(false);
        form.reset(data, { keepValues: true });
        showMessage('Draft colourway created', 'success');
        if (isCopyMode) {
          navigate(ROUTES.product, { replace: true });
        } else if (res.colorwayId) {
          // Open the fresh DRAFT so the operator can add variants, the size chart, then publish.
          navigate(generatePath(ROUTES.singleProduct, { id: String(res.colorwayId) }));
        } else {
          setMediaClearKey((k) => k + 1);
        }
        return;
      }

      const colorwayId = product?.colorway?.id;
      if (colorwayId == null) {
        showMessage('Missing colourway id', 'error');
        return;
      }
      await adminService.UpdateColorway({
        colorwayId,
        expectedColorwayVersion: product?.colorway?.lockVersion,
        updateMask: buildColorwayUpdateMask(data),
        ...common,
      });
      setIsFormChanged(false);
      form.reset(data, { keepValues: true });
      showMessage('Colourway updated', 'success');
      onEditModeChange(false);
      onStockUpdated?.();
    } catch (e) {
      const err = e as Error & { status?: number };
      // gRPC ABORTED (stale optimistic lock) surfaces as HTTP 409 through the gateway.
      const message =
        err?.status === 409
          ? 'This colourway changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to save colourway';
      showMessage(message, 'error');
      console.error('Colorway save error', e);
    }
  }

  const getFirstErrorMessage = (errs: Record<string, unknown>): string | undefined => {
    for (const value of Object.values(errs)) {
      if (
        value &&
        typeof value === 'object' &&
        'message' in value &&
        typeof (value as { message: unknown }).message === 'string'
      ) {
        return (value as { message: string }).message;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = getFirstErrorMessage(value as Record<string, unknown>);
        if (nested) return nested;
      }
    }
    return undefined;
  };

  const handleFormError = (errors: FieldErrors<ProductFormData>) => {
    const message =
      getFirstErrorMessage(errors as Record<string, unknown>) ?? 'Please fix the form errors';
    showMessage(message, 'error');
  };

  const display = product?.colorway?.display;
  const headerTitle = isAddingProduct
    ? isCopyMode
      ? 'copy product'
      : 'new product'
    : `[${product?.colorway?.id ?? productId ?? ''}] ${display?.merchandising?.brand ?? ''} ${
        display?.translations?.[0]?.name ?? ''
      }`.trim();

  const handleCancel = () => {
    if (isAddingProduct) {
      navigate(ROUTES.product);
      return;
    }
    form.reset(initialValues);
    setIsFormChanged(false);
    onEditModeChange(false);
  };

  const submitForm = () => form.handleSubmit(handleSubmit, handleFormError)();

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit, handleFormError)}
      >
        {/* Header — identity + status */}
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.product}>← products</Link>
            </Button>
            <Text variant='uppercase' size='large'>
              {headerTitle || 'product'}
            </Text>
            <StatusBadge status={product?.colorway?.status} />
            {!editMode && (
              <Text variant='inactive' size='small'>
                view only
              </Text>
            )}
          </div>
        </div>

        {/* R6: stored lifecycle — publish/hide/unhide/archive act on the persisted colourway,
            independent of the form's edit state. Only for existing (saved) colourways. */}
        {productId && !isCopyMode && !isAddingProduct && product?.colorway?.id != null && (
          <LifecycleControls
            colorwayId={product.colorway.id}
            status={product.colorway.status}
            lockVersion={product.colorway.lockVersion}
            canWrite={canWrite(SECTION.products)}
            onChanged={onStockUpdated}
          />
        )}

        <div className='flex flex-col lg:flex-row lg:items-start gap-6'>
          <Section title='media' className='w-full lg:w-1/2'>
            <div className='flex flex-row gap-5'>
              <Thumbnail
                product={product}
                control={form.control}
                variant='primary'
                editMode={editMode}
              />
              <Thumbnail
                product={product}
                control={form.control}
                variant='secondary'
                editMode={editMode}
              />
            </div>
            <MediaAds
              product={product}
              control={form.control}
              clearKey={mediaClearKey}
              editMode={editMode}
            />
          </Section>

          <Section title='details' className='w-full lg:w-1/2'>
            {isAddingProduct && <StylePicker name='styleId' disabled={!editMode} />}
            <BodyFields editMode={editMode} isAddingProduct={isAddingProduct} />
            <Tags
              isAddingProduct={isAddingProduct}
              isEditMode={isEditMode}
              isCopyMode={isCopyMode}
              editMode={editMode}
            />
          </Section>
        </div>

        {/* R4: style facts (brand, season, collection, gender, fit, categories, composition, care,
            model-wears) are shared by every colourway of the style and save through UpdateStyle under
            their own optimistic lock — isolated here so a blocked season change (frozen siblings) does
            not fail the colourway save. Shown outside editMode too (read-only) so model-wears stays
            visible without entering edit — not gated on editMode the way the rest of this form is;
            <StyleSection/> derives its own canEdit from the editMode prop instead. Never shown in
            add-mode: there is no created colourway yet for this section's own Save to attach to. */}
        {!isAddingProduct && product?.colorway?.styleId != null && (
          <StyleSection
            styleId={product.colorway.styleId}
            lockVersion={product.colorway.lockVersion}
            canWrite={canWrite(SECTION.products)}
            editMode={editMode}
            onChanged={onStockUpdated}
          />
        )}

        {(canReadCosting || canWriteCosting) && (
          <Section title='cost'>
            <ProductCostSection
              editMode={editMode}
              costInfo={costInfo}
              productId={productId}
              lockVersion={product?.colorway?.lockVersion}
              isAddingProduct={isAddingProduct}
              onCostSynced={onStockUpdated}
            />
          </Section>
        )}

        <Section title='sizes & stock'>
          <SizeMeasurements
            editMode={editMode}
            productId={productId ? Number(productId) : undefined}
            styleId={product?.colorway?.styleId}
            lockVersion={product?.colorway?.lockVersion}
            variants={product?.variants}
            onStockUpdated={onStockUpdated}
          />
        </Section>

        {productId && !isCopyMode && (
          <Section title='fittings'>
            <FittingsReadonlyList productId={Number(productId)} />
          </Section>
        )}

        {productId && !isCopyMode && (
          <Section title='customs'>
            <ProductCustomsSection
              productId={Number(productId)}
              canWrite={canWrite(SECTION.products)}
            />
          </Section>
        )}
      </form>

      {/* Sticky action bar */}
      <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textInactiveColor bg-bgColor px-3 py-2 print:hidden'>
        <Text variant='inactive' size='small'>
          {editMode && isFormChanged ? 'unsaved changes' : ' '}
        </Text>
        {canWrite(SECTION.products) && (
          <div className='flex items-center gap-2'>
            {!editMode ? (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase cursor-pointer'
                onClick={() => onEditModeChange(true)}
              >
                edit
              </Button>
            ) : (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase cursor-pointer'
                  onClick={handleCancel}
                >
                  cancel
                </Button>
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase cursor-pointer'
                  disabled={(isEditMode && !isFormChanged) || form.formState.isSubmitting}
                  loading={form.formState.isSubmitting}
                  onClick={submitForm}
                >
                  {isAddingProduct ? (isCopyMode ? 'create copy' : 'create') : 'save'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Form>
  );
}

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`space-y-4 border border-textInactiveColor p-4 ${className ?? ''}`}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}
