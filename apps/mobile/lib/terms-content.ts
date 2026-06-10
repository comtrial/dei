export type TermsDocumentId = 'service' | 'privacy' | 'location' | 'marketing';

export type TermsDocumentBlock = {
  heading: string;
  paragraphs: string[];
};

export type TermsDocument = {
  id: TermsDocumentId;
  label: string;
  title: string;
  required: boolean;
  summary: string;
  updatedAt: string;
  blocks: TermsDocumentBlock[];
};

export const TERMS_DOCUMENTS: Record<TermsDocumentId, TermsDocument> = {
  service: {
    id: 'service',
    label: '서비스 이용약관',
    title: '서비스 이용약관',
    required: true,
    summary: '계정, 매칭, 방 이용, 결제와 제재 기준을 안내합니다.',
    updatedAt: '2026.05.30',
    blocks: [
      {
        heading: '1. 목적',
        paragraphs: [
          '이 약관은 dei 앱이 제공하는 매칭, 방, 채팅, 영상 인증, 결제 및 고객지원 기능의 이용 조건과 회사와 회원의 권리·의무를 정합니다.',
        ],
      },
      {
        heading: '2. 가입 및 이용 자격',
        paragraphs: [
          'dei는 만 19세 이상 회원만 이용할 수 있습니다. 회원은 본인 명의의 인증 수단으로 가입해야 하며, 타인의 정보를 사용하거나 허위 정보를 입력할 수 없습니다.',
          '회사는 본인인증, 연령 확인, 운영 정책 위반 여부를 확인하기 위해 필요한 범위에서 가입 또는 이용을 제한할 수 있습니다.',
        ],
      },
      {
        heading: '3. 매칭 및 방 이용',
        paragraphs: [
          '회원은 프로필, 지역, 성별, 참여 인원 등 서비스 운영 기준에 따라 매칭 큐에 참여할 수 있습니다.',
          '매칭이 성사되면 방이 생성되며, 회원은 방 안에서 채팅, 영상 인증, 신고, 차단, 방 나가기 등 앱이 제공하는 기능을 사용할 수 있습니다.',
          '방 나가기, 매칭 취소, 재매칭 제한, 부스터 패스 사용 등은 앱 화면과 운영 정책에 표시된 조건을 따릅니다.',
        ],
      },
      {
        heading: '4. 금지 행위',
        paragraphs: [
          '회원은 욕설, 혐오 표현, 성희롱, 협박, 사칭, 불법 촬영물 공유, 외부 연락처 강요, 서비스 운영 방해 행위를 해서는 안 됩니다.',
          '위반 행위가 확인되면 회사는 콘텐츠 제한, 매칭 제한, 계정 정지, 탈퇴 처리 등 필요한 조치를 할 수 있습니다.',
        ],
      },
      {
        heading: '5. 결제 및 환불',
        paragraphs: [
          '부스터 등 유료 상품은 앱 스토어 결제 정책과 서비스 내 안내 조건에 따라 제공됩니다.',
          '환불은 앱 스토어, 결제사, 관련 법령 및 서비스 운영 기준에 따라 처리됩니다.',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    label: '개인정보 처리방침',
    title: '개인정보 처리방침',
    required: true,
    summary: '본인인증, 프로필, 매칭, 신고 처리에 필요한 개인정보 기준을 안내합니다.',
    updatedAt: '2026.05.30',
    blocks: [
      {
        heading: '1. 수집하는 정보',
        paragraphs: [
          '회원 가입 및 본인인증 과정에서 휴대전화 인증 결과, 생년월일 또는 출생연도, 성별 등 연령 확인에 필요한 정보를 처리할 수 있습니다.',
          '프로필 생성과 서비스 이용 과정에서 닉네임, 사진, 지역, MBTI, 자기소개, 매칭·방·채팅·신고·차단 기록이 생성될 수 있습니다.',
        ],
      },
      {
        heading: '2. 이용 목적',
        paragraphs: [
          '수집한 정보는 회원 식별, 연령 확인, 매칭 제공, 방 운영, 부정 이용 방지, 신고 처리, 고객지원, 결제 및 환불 지원에 사용됩니다.',
          '서비스 안정성 확보와 품질 개선을 위해 오류 로그와 사용 이벤트를 최소한의 범위에서 분석할 수 있습니다.',
        ],
      },
      {
        heading: '3. 보관 및 파기',
        paragraphs: [
          '개인정보는 서비스 제공에 필요한 기간 동안 보관하며, 탈퇴 또는 목적 달성 후에는 관련 법령에 따른 보존 의무가 있는 경우를 제외하고 지체 없이 파기합니다.',
          '신고, 제재, 결제, 고객지원 기록은 분쟁 대응과 법적 의무 이행을 위해 필요한 기간 동안 별도로 보관될 수 있습니다.',
        ],
      },
      {
        heading: '4. 회원의 권리',
        paragraphs: [
          '회원은 앱 내 프로필과 고객센터를 통해 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.',
          '필수 정보 처리를 거부하면 본인인증, 매칭, 방 이용 등 핵심 기능 사용이 제한될 수 있습니다.',
        ],
      },
    ],
  },
  location: {
    id: 'location',
    label: '위치정보 수집 (매칭 추천용)',
    title: '위치정보 수집 및 이용 동의',
    required: false,
    summary: '선택 동의 시 현재 위치로 활동 지역을 자동 입력하고 매칭 추천에 활용합니다.',
    updatedAt: '2026.05.30',
    blocks: [
      {
        heading: '1. 수집 항목',
        paragraphs: [
          '선택 동의한 회원에 한해 앱은 기기의 현재 위치 권한을 요청할 수 있습니다.',
          '현재 위치는 지역 자동 입력과 매칭 추천 지역 보정에 사용돼요. 앱이 항상 위치를 추적하거나 백그라운드에서 지속 수집하지 않습니다.',
        ],
      },
      {
        heading: '2. 이용 목적',
        paragraphs: [
          '위치정보는 프로필 지역을 빠르게 입력하고, 가까운 활동 지역 기반의 매칭 추천 품질을 높이기 위해 사용됩니다.',
          '회원은 위치정보 제공에 동의하지 않아도 직접 지역을 선택해 서비스를 이용할 수 있습니다.',
        ],
      },
      {
        heading: '3. 보관 및 철회',
        paragraphs: [
          '앱은 현재 위치 자체보다 변환된 활동 지역 정보를 서비스 이용에 필요한 범위에서 저장합니다.',
          '회원은 기기 설정에서 위치 권한을 철회할 수 있으며, 이후 위치 기반 자동 입력 기능은 동작하지 않습니다.',
        ],
      },
    ],
  },
  marketing: {
    id: 'marketing',
    label: '마케팅 정보 수신',
    title: '마케팅 정보 수신 동의',
    required: false,
    summary: '이벤트, 혜택, 서비스 소식을 앱 알림 등으로 받을 수 있습니다.',
    updatedAt: '2026.05.30',
    blocks: [
      {
        heading: '1. 수신 내용',
        paragraphs: [
          '회원은 이벤트, 혜택, 신규 기능, 서비스 안내 등 마케팅 정보를 받을 수 있습니다.',
          '중요 공지, 약관 변경, 결제, 보안, 계정 관련 안내는 마케팅 수신 동의 여부와 관계없이 발송될 수 있습니다.',
        ],
      },
      {
        heading: '2. 수신 방법',
        paragraphs: [
          '마케팅 정보는 앱 푸시, 앱 내 알림, 문자, 이메일 등 회원이 제공하거나 허용한 수단으로 발송될 수 있습니다.',
        ],
      },
      {
        heading: '3. 철회',
        paragraphs: [
          '회원은 언제든지 앱 설정 또는 고객센터를 통해 마케팅 수신 동의를 철회할 수 있습니다.',
          '동의를 철회해도 서비스 이용에는 제한이 없습니다.',
        ],
      },
    ],
  },
};

export const TERMS_DOCUMENT_SECTIONS = [
  TERMS_DOCUMENTS.service,
  TERMS_DOCUMENTS.privacy,
  TERMS_DOCUMENTS.location,
  TERMS_DOCUMENTS.marketing,
] as const;

export function isTermsDocumentId(value: unknown): value is TermsDocumentId {
  return (
    value === 'service'
    || value === 'privacy'
    || value === 'location'
    || value === 'marketing'
  );
}
