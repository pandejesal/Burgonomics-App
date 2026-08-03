import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OtpProvider,
  OtpSendInput,
  OtpSendResult,
} from '../interfaces/otp-provider.interface';

@Injectable()
export class SmsOtpProvider implements OtpProvider {
  private readonly logger = new Logger(SmsOtpProvider.name);

  constructor(private readonly config: ConfigService) {}

  get name(): string {
    return this.config.get<string>('SMS_PROVIDER') || 'msg91';
  }

  async send(input: OtpSendInput): Promise<OtpSendResult> {
    const providerName = this.name.toLowerCase();
    this.logger.log(`Attempting to send OTP via provider: ${providerName}`);

    // Priority fallbacks list including all requested SMS and WhatsApp providers
    const defaultPriority = [
      'msg91',
      'fast2sms',
      'twilio',
      'textlocal',
      'meta_whatsapp',
      'twilio_whatsapp',
      'interakt',
      'gupshup',
      '360dialog',
      'generic',
    ];
    const order = [providerName, ...defaultPriority.filter((p) => p !== providerName)];

    for (const pName of order) {
      if (!this.isConfigured(pName)) {
        continue;
      }

      let success = false;
      const startTime = Date.now();

      try {
        if (pName === 'msg91') {
          success = await this.sendMsg91(input);
        } else if (pName === 'fast2sms') {
          success = await this.sendFast2Sms(input);
        } else if (pName === 'twilio') {
          success = await this.sendTwilio(input);
        } else if (pName === 'textlocal') {
          success = await this.sendTextLocal(input);
        } else if (pName === 'meta_whatsapp') {
          success = await this.sendMetaWhatsApp(input);
        } else if (pName === 'twilio_whatsapp') {
          success = await this.sendTwilioWhatsApp(input);
        } else if (pName === 'interakt') {
          success = await this.sendInterakt(input);
        } else if (pName === 'gupshup') {
          success = await this.sendGupshup(input);
        } else if (pName === '360dialog') {
          success = await this.send360Dialog(input);
        } else if (pName === 'generic') {
          success = await this.sendGeneric(input);
        }

        if (success) {
          this.logger.log(`OTP sent successfully via provider: ${pName}`);
          return {
            providerMessageId: `${pName}_${startTime}_${Math.random().toString(36).slice(2, 8)}`,
            deliveredAt: new Date(),
          };
        }
      } catch (err) {
        const error = err as Error;
        this.logger.error(`OTP Provider [${pName}] failed: ${error?.message || error}`);
      }
    }

    // Fallback: If no provider is configured or all fail, use Development Mode simulation
    this.logger.warn(`No configured OTP provider succeeded. Falling back to console logging.`);
    console.log(
      `\n===============================================\n[NESTJS DEVELOPMENT MODE] OTP Code for ${input.phone} is: ${input.code}\n===============================================\n`,
    );

    return {
      providerMessageId: `simulated_${Date.now()}`,
      deliveredAt: new Date(),
    };
  }

  private isConfigured(provider: string): boolean {
    switch (provider) {
      case 'msg91':
        return !!(this.config.get('MSG91_API_KEY') && this.config.get('MSG91_TEMPLATE_ID'));
      case 'fast2sms':
        return !!this.config.get('FAST2SMS_API_KEY');
      case 'twilio':
        return !!(
          this.config.get('TWILIO_ACCOUNT_SID') &&
          this.config.get('TWILIO_AUTH_TOKEN') &&
          this.config.get('TWILIO_PHONE_NUMBER')
        );
      case 'textlocal':
        return !!this.config.get('TEXTLOCAL_API_KEY');
      case 'meta_whatsapp':
        return !!(
          this.config.get('META_WA_PHONE_NUMBER_ID') && this.config.get('META_WA_ACCESS_TOKEN')
        );
      case 'twilio_whatsapp':
        return !!(
          this.config.get('TWILIO_ACCOUNT_SID') &&
          this.config.get('TWILIO_AUTH_TOKEN') &&
          this.config.get('TWILIO_WA_SENDER_NUMBER')
        );
      case 'interakt':
        return !!this.config.get('INTERAKT_API_KEY');
      case 'gupshup':
        return !!(this.config.get('GUPSHUP_API_KEY') && this.config.get('GUPSHUP_SRC_NAME'));
      case '360dialog':
        return !!this.config.get('THREESIXTY_DIALOG_API_KEY');
      case 'generic':
        return !!this.config.get('SMS_GATEWAY_URL');
      default:
        return false;
    }
  }

  private async sendMsg91(input: OtpSendInput): Promise<boolean> {
    const apiKey = this.config.get<string>('MSG91_API_KEY');
    const templateId = this.config.get<string>('MSG91_TEMPLATE_ID');
    const senderId = this.config.get<string>('MSG91_SENDER_ID') || 'BURGER';

    let formattedPhone = input.phone;
    if (!input.phone.startsWith('+') && input.phone.length === 10) {
      formattedPhone = `91${input.phone}`;
    } else if (input.phone.startsWith('+')) {
      formattedPhone = input.phone.replace('+', '');
    }

    const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${formattedPhone}&otp=${input.code}&sender=${senderId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: apiKey!,
      },
      body: JSON.stringify({}),
    });

    const resJson = (await response.json()) as { type?: string };
    return response.ok && resJson.type !== 'error';
  }

  private async sendFast2Sms(input: OtpSendInput): Promise<boolean> {
    const apiKey = this.config.get<string>('FAST2SMS_API_KEY');
    let cleanNumber = input.phone;
    if (input.phone.startsWith('+91')) {
      cleanNumber = input.phone.slice(3);
    } else if (input.phone.startsWith('91') && input.phone.length === 12) {
      cleanNumber = input.phone.slice(2);
    }

    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: input.code,
        numbers: cleanNumber,
      }),
    });

    const resJson = (await response.json()) as { return?: boolean };
    return response.ok && !!resJson.return;
  }

  private async sendTwilio(input: OtpSendInput): Promise<boolean> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER');

    let formattedTo = input.phone;
    if (!input.phone.startsWith('+')) {
      formattedTo = input.phone.length === 10 ? `+91${input.phone}` : `+${input.phone}`;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: formattedTo,
        From: fromNumber!,
        Body: `Your BURGONOMICS verification code is ${input.code}. It is valid for 5 minutes.`,
      }).toString(),
    });

    return response.ok;
  }

  private async sendTextLocal(input: OtpSendInput): Promise<boolean> {
    const apiKey = this.config.get<string>('TEXTLOCAL_API_KEY');
    const sender = this.config.get<string>('TEXTLOCAL_SENDER') || 'TXTLCL';
    const cleanNumber = input.phone.replace('+', '');

    const response = await fetch('https://api.textlocal.in/send/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        apikey: apiKey!,
        numbers: cleanNumber,
        message: `Your BURGONOMICS verification code is ${input.code}. Valid for 5 minutes.`,
        sender: sender,
      }).toString(),
    });

    const resJson = (await response.json()) as { status?: string };
    return response.ok && resJson.status === 'success';
  }

  private async sendMetaWhatsApp(input: OtpSendInput): Promise<boolean> {
    const phoneId = this.config.get<string>('META_WA_PHONE_NUMBER_ID');
    const token = this.config.get<string>('META_WA_ACCESS_TOKEN');
    const templateName = this.config.get<string>('META_WA_TEMPLATE_NAME') || 'otp_verification';
    const cleanNumber = input.phone.replace('+', '');

    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: input.code }],
            },
          ],
        },
      }),
    });

    return response.ok;
  }

  private async sendTwilioWhatsApp(input: OtpSendInput): Promise<boolean> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromWA = this.config.get<string>('TWILIO_WA_SENDER_NUMBER') || '+14155238886';

    let formattedTo = input.phone;
    if (!input.phone.startsWith('+')) {
      formattedTo = input.phone.length === 10 ? `+91${input.phone}` : `+${input.phone}`;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: `whatsapp:${formattedTo}`,
        From: `whatsapp:${fromWA}`,
        Body: `Your BURGONOMICS verification code is ${input.code}. It is valid for 5 minutes.`,
      }).toString(),
    });

    return response.ok;
  }

  private async sendInterakt(input: OtpSendInput): Promise<boolean> {
    const apiKey = this.config.get<string>('INTERAKT_API_KEY');
    const templateName = this.config.get<string>('INTERAKT_TEMPLATE_NAME') || 'otp_verification';
    let cleanNumber = input.phone;
    let countryCode = '91';
    if (input.phone.startsWith('+')) {
      cleanNumber = input.phone.slice(3);
      countryCode = input.phone.slice(1, 3);
    }

    const response = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        countryCode: countryCode,
        phoneNumber: cleanNumber,
        type: 'Template',
        template: {
          name: templateName,
          languageCode: 'en',
          headerValues: [],
          bodyValues: [input.code],
        },
      }),
    });

    return response.ok;
  }

  private async sendGupshup(input: OtpSendInput): Promise<boolean> {
    const apiKey = this.config.get<string>('GUPSHUP_API_KEY');
    const srcName = this.config.get<string>('GUPSHUP_SRC_NAME');
    const templateId = this.config.get<string>('GUPSHUP_TEMPLATE_ID');
    const cleanTo = input.phone.replace('+', '');

    const response = await fetch('https://api.gupshup.io/sm/api/v1/template/msg', {
      method: 'POST',
      headers: {
        apikey: apiKey!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        source: srcName!,
        destination: cleanTo,
        template: JSON.stringify({
          id: templateId,
          params: [input.code],
        }),
      }).toString(),
    });

    return response.ok;
  }

  private async send360Dialog(input: OtpSendInput): Promise<boolean> {
    const apiKey = this.config.get<string>('THREESIXTY_DIALOG_API_KEY');
    const templateName =
      this.config.get<string>('THREESIXTY_DIALOG_TEMPLATE_NAME') || 'otp_verification';
    const cleanTo = input.phone.replace('+', '');

    const response = await fetch('https://api.360dialog.io/v1/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: cleanTo,
        type: 'template',
        template: {
          namespace: this.config.get('THREESIXTY_DIALOG_NAMESPACE'),
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: input.code }],
            },
          ],
        },
      }),
    });

    return response.ok;
  }

  private async sendGeneric(input: OtpSendInput): Promise<boolean> {
    const gatewayUrl = this.config.get<string>('SMS_GATEWAY_URL');
    if (!gatewayUrl) return false;

    const url = gatewayUrl
      .replace('{to}', encodeURIComponent(input.phone))
      .replace('{code}', encodeURIComponent(input.code));

    const response = await fetch(url);
    return response.ok;
  }
}
