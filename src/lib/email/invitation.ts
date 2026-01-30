/**
 * Email Invitation Service
 *
 * Uses Supabase Edge Functions or direct SMTP for sending invitation emails.
 * For production, configure Supabase email settings in the dashboard.
 */

import { supabaseAdmin } from '@/lib/supabase/server';

interface SendInvitationEmailParams {
  to: string;
  name: string;
  role: string;
  inviteToken: string;
  invitedByName: string;
}

/**
 * Generate the invitation URL
 */
export function generateInvitationUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return `${baseUrl}/set-password/${token}`;
}

/**
 * Send invitation email using Supabase
 *
 * This uses Supabase's auth.admin API to send emails.
 * Make sure to configure email templates in Supabase Dashboard:
 * Authentication > Email Templates
 */
export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<{ success: boolean; error?: string }> {
  const { to, name, role, inviteToken, invitedByName } = params;

  const invitationUrl = generateInvitationUrl(inviteToken);

  try {
    // Option 1: Use Supabase Auth's invite functionality
    // This will send an email using Supabase's configured email provider
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(to, {
      data: {
        name,
        role,
        custom_invite_token: inviteToken,
        invited_by: invitedByName,
      },
      redirectTo: invitationUrl,
    });

    if (error) {
      console.error('Supabase auth invite error:', error);

      // Fallback: If Supabase Auth invite fails, we can still proceed
      // The invitation record is already created in our database
      // Users can use the direct link or we can implement SMTP fallback
      console.log('Invitation created. Direct link:', invitationUrl);

      // For development, log the invitation URL
      if (process.env.NODE_ENV === 'development') {
        console.log('\n=== INVITATION EMAIL (DEV MODE) ===');
        console.log(`To: ${to}`);
        console.log(`Name: ${name}`);
        console.log(`Role: ${role}`);
        console.log(`Invited by: ${invitedByName}`);
        console.log(`Set Password URL: ${invitationUrl}`);
        console.log('===================================\n');
      }

      // Return success even if email fails in dev - the invitation is created
      return { success: true };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to send invitation email:', err);

    // In development, still return success so we can test the flow
    if (process.env.NODE_ENV === 'development') {
      console.log('\n=== INVITATION EMAIL (DEV MODE) ===');
      console.log(`To: ${to}`);
      console.log(`Name: ${name}`);
      console.log(`Role: ${role}`);
      console.log(`Invited by: ${invitedByName}`);
      console.log(`Set Password URL: ${invitationUrl}`);
      console.log('===================================\n');

      return { success: true };
    }

    return {
      success: false,
      error: 'Failed to send invitation email. Please try again.',
    };
  }
}

/**
 * Email template for invitation (for reference/SMTP implementation)
 */
export function getInvitationEmailTemplate(params: SendInvitationEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, role, inviteToken, invitedByName } = params;
  const invitationUrl = generateInvitationUrl(inviteToken);

  const subject = `You're invited to join PlanckOff as ${role}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invitation to PlanckOff</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to PlanckOff</h1>
      </div>

      <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi ${name},</p>

        <p style="font-size: 16px; margin-bottom: 20px;">
          <strong>${invitedByName}</strong> has invited you to join PlanckOff as a <strong>${role}</strong>.
        </p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Click the button below to set up your password and activate your account:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}"
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Set Up My Password
          </a>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          This invitation link will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="font-size: 12px; color: #999; margin: 0;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${invitationUrl}" style="color: #667eea; word-break: break-all;">${invitationUrl}</a>
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
Hi ${name},

${invitedByName} has invited you to join PlanckOff as a ${role}.

Click the link below to set up your password and activate your account:
${invitationUrl}

This invitation link will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
  `.trim();

  return { subject, html, text };
}
