import { Injectable, Logger } from '@nestjs/common';
import { PetpoojaHttpClient } from '../http/petpooja-http.client';
import { PetpoojaCredentialsService } from './petpooja-credentials.service';
import { PETPOOJA_ENDPOINTS, PETPOOJA_METRIC_LABELS, PETPOOJA_RIDER_STATUS } from '../constants';
import {
  FetchMenuRequestSchema,
  PetpoojaAckSchema,
  PetpoojaMenuResponseSchema,
  RiderStatusUpdateRequestSchema,
  SaveOrderRequestSchema,
  UpdateOrderStatusRequestSchema,
  type PetpoojaAck,
  type PetpoojaMenuResponse,
  type RiderStatusUpdateRequest,
  type SaveOrderRequest,
  type UpdateOrderStatusRequest,
} from '../dto/petpooja.dto';

/**
 * Typed PETPOOJA operations. This is the ONLY place that composes
 * request payloads (via strict Zod validation) and dispatches them
 * through the HTTP client. Every method is idempotent from PETPOOJA's
 * perspective — the client-side orderID / restID guarantees dedup.
 */
@Injectable()
export class PetpoojaService {
  private readonly logger = new Logger(PetpoojaService.name);

  constructor(
    private readonly http: PetpoojaHttpClient,
    private readonly credentials: PetpoojaCredentialsService,
  ) {}

  /** @deprecated The Petpooja Fetch Menu API (/mapped_restaurant_menus) is DEPRECATED. Use inbound Push Menu Webhook instead. */
  async fetchMenu(petpoojaRestId: string, correlationId?: string): Promise<PetpoojaMenuResponse> {
    this.logger.error(
      `[${correlationId}] Attempted to invoke deprecated Fetch Menu API for restID=${petpoojaRestId}`,
    );
    throw new Error(
      'The Petpooja Fetch Menu API (/mapped_restaurant_menus) is DEPRECATED. Petpooja POS pushes menu updates asynchronously via the inbound Push Menu Webhook.',
    );
  }

  /** POST /save_order — sends a placed order to PETPOOJA PoS. */
  async saveOrder(payload: SaveOrderRequest, correlationId?: string): Promise<PetpoojaAck> {
    const body = SaveOrderRequestSchema.parse(payload);
    const raw = await this.http.postJson<unknown>(PETPOOJA_ENDPOINTS.SAVE_ORDER, body, {
      metricLabel: PETPOOJA_METRIC_LABELS.SAVE_ORDER,
      correlationId,
    });
    return PetpoojaAckSchema.parse(raw);
  }

  /** POST /update_order_status — cancel/update from consumer side. */
  async cancelOrder(
    input: Omit<UpdateOrderStatusRequest, 'app_key' | 'app_secret' | 'access_token' | 'orderID'>,
    correlationId?: string,
  ): Promise<PetpoojaAck> {
    const creds = this.credentials.credentials();
    const body = UpdateOrderStatusRequestSchema.parse({
      ...creds,
      orderID: '',
      ...input,
    });
    const raw = await this.http.postJson<unknown>(PETPOOJA_ENDPOINTS.UPDATE_ORDER_STATUS, body, {
      metricLabel: PETPOOJA_METRIC_LABELS.UPDATE_ORDER_STATUS,
      correlationId,
    });
    return PetpoojaAckSchema.parse(raw);
  }

  /** POST /rider_status_update — pushes rider progress to PETPOOJA. */
  async riderStatusUpdate(
    input: Omit<RiderStatusUpdateRequest, 'app_key' | 'app_secret' | 'access_token'>,
    correlationId?: string,
  ): Promise<PetpoojaAck> {
    const creds = this.credentials.credentials();
    const body = RiderStatusUpdateRequestSchema.parse({ ...creds, ...input });
    const raw = await this.http.postJson<unknown>(PETPOOJA_ENDPOINTS.RIDER_STATUS_UPDATE, body, {
      metricLabel: PETPOOJA_METRIC_LABELS.RIDER_STATUS,
      correlationId,
    });
    return PetpoojaAckSchema.parse(raw);
  }

  /** Health-check helper. Non-throwing. */
  breakerStates(): Record<string, string> {
    return this.http.breakerStates();
  }

  static readonly RIDER_STATUSES = PETPOOJA_RIDER_STATUS;
}
