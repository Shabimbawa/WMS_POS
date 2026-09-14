import { useState, type ReactNode } from 'react';
import { Button, Form, Modal } from 'antd';
import type { ButtonProps, FormInstance } from 'antd';
import { confirmDiscardChanges } from '../../utils/confirmClose';

type CommonModalFormProps<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  title: ReactNode;
  triggerLabel: ReactNode;
  initialValues?: Partial<TValues>;
  onSave: (updatedValues: TValues) => void | Promise<void>;
  children: ReactNode | ((form: FormInstance<TValues>) => ReactNode);
  formName?: string;
  width?: number | string;
  okText?: string;
  cancelText?: string;
  triggerButtonType?: ButtonProps['type'];
  triggerButtonStyle?: ButtonProps['style'];
};

export default function CommonModalForm<TValues extends Record<string, unknown> = Record<string, unknown>>({
  title,
  triggerLabel,
  initialValues,
  onSave,
  children,
  formName = 'common_modal_form',
  width = 600,
  okText = 'Save',
  cancelText = 'Cancel',
  triggerButtonType = 'primary',
  triggerButtonStyle,
}: CommonModalFormProps<TValues>) {
  const [open, setOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [form] = Form.useForm<TValues>();

  const showModal = () => {
    setOpen(true);
    form.setFieldsValue(initialValues as Parameters<typeof form.setFieldsValue>[0]);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);
      await onSave(values);
      setOpen(false);
      form.resetFields();
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    confirmDiscardChanges(form, () => {
      setOpen(false);
      form.resetFields();
    });
  };

  return (
    <>
      <Button type={triggerButtonType} style={triggerButtonStyle} onClick={showModal}>
        {triggerLabel}
      </Button>
      <Modal
        title={title}
        open={open}
        onOk={handleOk}
        okText={okText}
        cancelText={cancelText}
        confirmLoading={confirmLoading}
        onCancel={handleCancel}
        width={width}
        destroyOnClose maskClosable={false}
      >
        <Form
          form={form}
          layout="vertical"
          name={formName}
          style={{ marginTop: 16, maxHeight: '65vh', overflowY: 'auto', paddingRight: 8 }}
        >
          {typeof children === 'function' ? children(form) : children}
        </Form>
      </Modal>
    </>
  );
}