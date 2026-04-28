import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export const initEmailService = () => {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<void> => {
  if (!transporter) initEmailService();
  
  await transporter!.sendMail({
    from: process.env.SMTP_FROM || 'noreply@supplier-appointments.com',
    to,
    subject,
    html,
  });
};

// Template: Appointment rescheduling request
export const sendRescheduleRequest = async (
  supplierEmail: string,
  supplierName: string,
  appointmentDate: Date,
  orderNumber: string
): Promise<void> => {
  const html = `
    <h2>Reschedule Your Delivery Appointment</h2>
    <p>Dear ${supplierName},</p>
    <p>Your delivery appointment for order <strong>${orderNumber}</strong> 
    scheduled for <strong>${appointmentDate.toLocaleDateString()}</strong> 
    was not honored.</p>
    <p>Please reschedule your appointment in the supplier portal.</p>
    <p>Thank you</p>
  `;

  await sendEmail(to, 'Reschedule Your Delivery Appointment', html);
};
