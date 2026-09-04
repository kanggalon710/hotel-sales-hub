/**
 * Bentuk payload webhook Chatwoot yang sesungguhnya.
 *
 * Tiga bug berturut-turut lolos ke produksi karena pengujian memakai payload
 * yang ditulis sendiri, dan payload buatan sendiri selalu berbentuk seperti yang
 * dibayangkan penulisnya. Chatwoot mengirim dua bentuk yang berbeda:
 *
 *   Bersarang - `message_created` membungkus `inbox`, `conversation`, `sender`
 *               sebagai objek terpisah.
 *   Datar     - `conversation_created`, `conversation_updated`, dan
 *               `conversation_status_changed` menyebar atribut percakapan di
 *               akar payload: `inbox_id`, `channel`, `meta.sender`,
 *               `meta.assignee`.
 *
 * Berkas ini menyalin kedua bentuk itu apa adanya. Setiap kali konektor
 * mengambil sebuah nilai dari payload, bentuk datar harus ikut diuji, karena di
 * situlah semua kegagalan sebelumnya bersembunyi.
 *
 * Rujukan:
 *   https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
 *   https://github.com/chatwoot/chatwoot/issues/13993
 */

export type Payload = Record<string, unknown>;

export const ACCOUNT = { id: 1, name: 'Jabnet Omnichannel' };
export const INBOX = { id: 2, name: 'Pararel', channel_type: 'Channel::Whatsapp' };
export const CONVERSATION_ID = 4207;
export const CONTACT = {
  id: 501,
  name: 'Mildan Zaini',
  phone_number: '+628111222333',
  email: null as string | null,
  identifier: null as string | null,
};
export const AGENT = { id: 11, name: 'Ilham', email: 'agent@example.com' };

/* ------------------------------------------------------------------ *
 * Bentuk datar: atribut percakapan tersebar di akar payload.
 * ------------------------------------------------------------------ */

function flatConversation(event: string, extra: Payload = {}, conversationId = CONVERSATION_ID): Payload {
  return {
    event,
    id: conversationId,
    inbox_id: INBOX.id,
    channel: INBOX.channel_type,
    status: 'open',
    account_id: ACCOUNT.id,
    can_reply: true,
    labels: [],
    custom_attributes: {},
    additional_attributes: {},
    meta: {
      sender: {
        id: CONTACT.id,
        name: CONTACT.name,
        phone_number: CONTACT.phone_number,
        email: CONTACT.email,
        identifier: CONTACT.identifier,
        thumbnail: '',
        type: 'contact',
      },
      assignee: null,
      channel: INBOX.channel_type,
    },
    messages: [],
    ...extra,
  };
}

/**
 * Sidik jari deduplikasi diturunkan dari entitas yang dibicarakan event, bukan
 * dari jam dinding, sehingga dua `conversation_updated` untuk percakapan yang
 * sama memang sengaja dianggap satu. Itu perilaku yang benar: Chatwoot dikenal
 * mengirim event yang sama dua kali (chatwoot#7402). Karena itu setiap skenario
 * di bawah memakai percakapannya sendiri, agar yang diuji adalah pembacaan
 * payload, bukan deduplikasinya.
 */
export const flat = {
  conversationCreated: (): Payload => flatConversation('conversation_created'),

  conversationStatusChanged: (): Payload =>
    flatConversation('conversation_status_changed', { status: 'resolved' }),

  conversationUpdated: (): Payload =>
    flatConversation('conversation_updated', {
      changed_attributes: [{ status: { current_value: 'open', previous_value: 'resolved' } }],
    }),

  /** Percakapan yang sudah ditugaskan ke seorang agen. */
  conversationAssigned: (): Payload =>
    flatConversation('conversation_updated', {
      meta: {
        sender: {
          id: CONTACT.id, name: CONTACT.name, phone_number: CONTACT.phone_number,
          email: CONTACT.email, identifier: CONTACT.identifier, type: 'contact',
        },
        assignee: { id: AGENT.id, name: AGENT.name, email: AGENT.email },
        channel: INBOX.channel_type,
      },
      changed_attributes: [{ assignee_id: { current_value: AGENT.id, previous_value: null } }],
    }, 4301),

  /** Percakapan berlabel, dipakai inbox non-penjualan dengan label pemicu. */
  conversationLabelled: (): Payload =>
    flatConversation('conversation_updated', {
      labels: ['room-inquiry'],
      changed_attributes: [{ label_list: { current_value: ['room-inquiry'], previous_value: [] } }],
    }, 4302),
};

/* ------------------------------------------------------------------ *
 * Bentuk bersarang: message_created membungkus setiap bagian.
 * ------------------------------------------------------------------ */

export const nested = {
  messageCreatedIncoming: (content = 'Halo, saya mau tanya kamar untuk 10-12 Oktober, 2 dewasa.'): Payload => ({
    event: 'message_created',
    id: 77001,
    content,
    message_type: 'incoming',
    created_at: new Date().toISOString(),
    account: ACCOUNT,
    inbox: INBOX,
    conversation: {
      id: CONVERSATION_ID,
      inbox_id: INBOX.id,
      status: 'open',
      labels: [],
      meta: {
        sender: {
          id: CONTACT.id, name: CONTACT.name, phone_number: CONTACT.phone_number,
          email: CONTACT.email, identifier: CONTACT.identifier, type: 'contact',
        },
        assignee: null,
      },
    },
    sender: {
      id: CONTACT.id,
      name: CONTACT.name,
      phone_number: CONTACT.phone_number,
      email: CONTACT.email,
      type: 'contact',
    },
  }),

  messageCreatedOutgoing: (content = 'Selamat siang, kami cek ketersediaannya dulu ya.'): Payload => ({
    event: 'message_created',
    id: 77002,
    content,
    message_type: 'outgoing',
    created_at: new Date().toISOString(),
    account: ACCOUNT,
    inbox: INBOX,
    conversation: {
      id: CONVERSATION_ID, inbox_id: INBOX.id, status: 'open', labels: [],
      meta: { sender: { id: CONTACT.id, name: CONTACT.name, phone_number: CONTACT.phone_number, type: 'contact' }, assignee: null },
    },
    sender: { id: AGENT.id, name: AGENT.name, email: AGENT.email, type: 'user' },
  }),

  contactCreated: (): Payload => ({
    event: 'contact_created',
    id: CONTACT.id,
    account: ACCOUNT,
    contact: {
      id: CONTACT.id, name: CONTACT.name, phone_number: CONTACT.phone_number,
      email: CONTACT.email, identifier: CONTACT.identifier,
    },
  }),

  contactUpdated: (): Payload => ({
    event: 'contact_updated',
    id: CONTACT.id,
    account: ACCOUNT,
    contact: {
      id: CONTACT.id, name: 'Mildan Zaini Putra', phone_number: CONTACT.phone_number,
      email: 'mildan@example.com', identifier: CONTACT.identifier,
    },
  }),

  /** Bentuk lama yang pernah dipakai konektor, dijaga agar tidak regresi. */
  conversationCreatedNested: (): Payload => ({
    event: 'conversation_created',
    account: ACCOUNT,
    inbox: INBOX,
    conversation: { id: 4208, inbox_id: INBOX.id, status: 'open', labels: [] },
    contact: { id: 502, name: 'Sri Wahyuni', phone_number: '+628111222444' },
  }),
};

/* ------------------------------------------------------------------ *
 * Bentuk cacat, untuk memastikan kegagalannya jelas dan bukan diam.
 * ------------------------------------------------------------------ */

export const malformed = {
  /** Tanpa id inbox sama sekali: harus dibedakan dari "belum dipetakan". */
  conversationWithoutInbox: (): Payload => ({
    event: 'conversation_created',
    id: 4209,
    status: 'open',
    meta: { sender: { id: 503, name: 'Tanpa Inbox', phone_number: '+628111222555', type: 'contact' } },
  }),

  /** Inbox yang tidak ada pemetaannya. */
  conversationUnmappedInbox: (): Payload => ({
    event: 'conversation_created',
    id: 4210,
    inbox_id: 999,
    channel: 'Channel::Email',
    status: 'open',
    meta: { sender: { id: 504, name: 'Inbox Asing', phone_number: '+628111222666', type: 'contact' } },
  }),

  /** Agen yang belum dipetakan ke pengguna CRM. */
  conversationUnmappedAgent: (): Payload => ({
    event: 'conversation_updated',
    id: 4303,
    inbox_id: INBOX.id,
    channel: INBOX.channel_type,
    status: 'open',
    meta: {
      sender: { id: CONTACT.id, name: CONTACT.name, phone_number: CONTACT.phone_number, type: 'contact' },
      assignee: { id: 8888, name: 'Agen Malam' },
    },
  }),

  /** Event tanpa acuan percakapan: harus diabaikan, bukan gagal. */
  unknownEvent: (): Payload => ({ event: 'webwidget_triggered', account: ACCOUNT }),
};
