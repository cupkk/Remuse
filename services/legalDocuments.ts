export type LegalDocumentKey = 'terms' | 'privacy' | 'ai';

export interface LegalDocumentSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  key: LegalDocumentKey;
  title: string;
  version: string;
  updatedAt: string;
  summary: string;
  sections: LegalDocumentSection[];
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  terms: {
    key: 'terms',
    title: '用户协议',
    version: '2026-03-13',
    updatedAt: '2026-03-13',
    summary: '说明 Re-Museum 的账号使用、内容责任、服务变更和账号处理规则。',
    sections: [
      {
        heading: '服务范围',
        body: [
          'Re-Museum 为用户提供旧物扫描、馆藏整理、灵感生成、贴纸生成、记忆对话和内容展示等数字服务。',
          '我们会持续迭代功能、界面和模型能力。为保障服务质量，部分功能可能按版本、额度或运营策略调整。',
        ],
      },
      {
        heading: '账号与安全',
        body: [
          '用户应当提供真实、可使用的邮箱地址，并妥善保管登录凭证。',
          '用户不得转让、出租、倒卖账号，不得利用服务进行违法、侵权、批量滥用或攻击性行为。',
        ],
      },
      {
        heading: '内容与责任',
        body: [
          '用户上传的图片、文字、故事和反馈内容，需保证拥有合法使用权，不得侵犯第三方权益。',
          'AI 生成内容可能存在误差、偏差或不稳定性，用户需自行判断其适用性，不应将其直接视为专业结论。',
        ],
      },
      {
        heading: '服务调整与终止',
        body: [
          '当用户违反协议、恶意滥用服务或影响平台稳定时，平台有权限制功能、冻结或终止账号。',
          '用户可以按产品内提供的流程申请注销账号，注销后与账号绑定的数据将按隐私政策处理。',
        ],
      },
    ],
  },
  privacy: {
    key: 'privacy',
    title: '隐私政策',
    version: '2026-03-13',
    updatedAt: '2026-03-13',
    summary: '说明我们收集哪些数据、为何收集、如何保存以及用户如何删除自己的数据。',
    sections: [
      {
        heading: '收集的信息',
        body: [
          '我们会收集注册邮箱、昵称、登录会话、上传的图片、馆藏内容、生成结果、记忆对话、反馈信息以及基础操作日志。',
          '为保障系统稳定，我们还会记录请求次数、失败率、耗时、设备会话和必要的安全审计信息。',
        ],
      },
      {
        heading: '使用目的',
        body: [
          '这些信息用于完成账号认证、保存用户创作内容、提供 AI 功能、恢复会话、改进产品质量和处理客服问题。',
          '我们不会将用户的私人馆藏内容公开展示；前台灵感广场当前为展示界面，不作为真实用户社区发布通道。',
        ],
      },
      {
        heading: '存储与共享',
        body: [
          '用户数据会存储在 Re-Museum 的服务器、数据库和备份介质中，并可能通过受控第三方服务完成邮件发送或模型调用。',
          '除法律要求、服务履约或用户明确授权外，我们不会向无关第三方出售用户个人信息。',
        ],
      },
      {
        heading: '用户权利',
        body: [
          '用户可以在产品内修改密码、退出其他设备，并通过客服入口反馈数据问题。',
          '账号删除后，平台将删除或匿名化与该账号直接关联的内容；因安全、审计和备份产生的有限留存会在合理期限内清除。',
        ],
      },
    ],
  },
  ai: {
    key: 'ai',
    title: 'AI 生成说明',
    version: '2026-03-13',
    updatedAt: '2026-03-13',
    summary: '说明 AI 生成功能的局限、额度约束和使用规范。',
    sections: [
      {
        heading: '能力边界',
        body: [
          'Re-Museum 的 AI 能力包括识别、摘要、创意建议、贴纸生成和记忆检索回答，但这些结果可能不完整、不准确或风格不稳定。',
          'AI 输出不构成法律、医疗、财务或其他专业意见，用户需自行判断并承担使用结果。',
        ],
      },
      {
        heading: '内容规范',
        body: [
          '用户不得利用 AI 功能生成违法、侵权、骚扰、仇恨、色情、暴力或其他违反平台规则的内容。',
          '当系统检测到异常请求、超量请求或高风险内容时，平台可以拒绝响应、降低额度或暂停相关功能。',
        ],
      },
      {
        heading: '额度与运营',
        body: [
          '当前版本按照免费版额度管理高成本 AI 功能，并保留后续升级套餐或企业版的能力。',
          '平台会记录基础模型调用量、失败率和耗时，仅用于成本控制、容量规划和稳定性排障。',
        ],
      },
    ],
  },
};

export const LEGAL_VERSION_SNAPSHOT = {
  terms: LEGAL_DOCUMENTS.terms.version,
  privacy: LEGAL_DOCUMENTS.privacy.version,
  ai: LEGAL_DOCUMENTS.ai.version,
} as const;

export function getLegalDocument(key: LegalDocumentKey): LegalDocument {
  return LEGAL_DOCUMENTS[key];
}

export function getAllLegalDocuments(): LegalDocument[] {
  return Object.values(LEGAL_DOCUMENTS);
}
