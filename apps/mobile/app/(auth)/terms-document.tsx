import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Text, TopNav } from '@dei/ui';

import { ROUTES } from '@/lib/routes';
import {
  isTermsDocumentId,
  TERMS_DOCUMENT_SECTIONS,
  TERMS_DOCUMENTS,
  type TermsDocumentId,
} from '@/lib/terms-content';

function normalizeSectionParam(section?: string | string[]): TermsDocumentId | null {
  const value = Array.isArray(section) ? section[0] : section;
  return isTermsDocumentId(value) ? value : null;
}

export default function TermsDocumentScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const selectedSection = normalizeSectionParam(section);
  const documents = selectedSection
    ? [TERMS_DOCUMENTS[selectedSection]]
    : TERMS_DOCUMENT_SECTIONS;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="약관 보기" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg" contentContainerClassName="pb-[44px]">
        <View className="px-[24px] pt-[18px]">
          <Text variant="h1" className="text-[24px] leading-[32px]">
            dei 약관
          </Text>
          <Text className="mt-[8px] text-[13px] leading-[20px] text-ink-3">
            서비스 이용 전 확인해야 할 약관 전문입니다.
          </Text>

          <View className="mt-[18px] flex-row flex-wrap gap-[8px]">
            {TERMS_DOCUMENT_SECTIONS.map((item) => {
              const selected = selectedSection === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} 보기`}
                  onPress={() =>
                    router.push({
                      pathname: ROUTES.termsDocument as '/(auth)/terms-document',
                      params: { section: item.id },
                    })
                  }
                  className={[
                    'rounded-full border px-[12px] py-[7px]',
                    selected ? 'border-ink bg-ink' : 'border-line bg-paper',
                  ].join(' ')}
                >
                  <Text className={selected ? 'text-[12px] font-bold text-white' : 'text-[12px] font-bold text-ink-2'}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-[26px] px-[24px] pt-[28px]">
          {documents.map((document) => (
            <View key={document.id}>
              <View className="flex-row items-center gap-[8px]">
                <Badge variant="required" tone={document.required ? 'accent' : 'info'}>
                  {document.required ? '필수' : '선택'}
                </Badge>
                <Text className="text-[11.5px] font-semibold text-ink-3">
                  시행일 {document.updatedAt}
                </Text>
              </View>

              <Text variant="h2" className="mt-[10px] text-[20px] leading-[28px]">
                {document.title}
              </Text>
              <Text className="mt-[8px] text-[13px] leading-[20px] text-ink-3">
                {document.summary}
              </Text>

              <View className="mt-[18px] gap-[18px]">
                {document.blocks.map((block) => (
                  <View key={block.heading}>
                    <Text className="text-[15px] font-extrabold leading-[22px] text-ink">
                      {block.heading}
                    </Text>
                    {block.paragraphs.map((paragraph) => (
                      <Text
                        key={paragraph}
                        className="mt-[7px] text-[13px] leading-[21px] text-ink-2"
                      >
                        {paragraph}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
