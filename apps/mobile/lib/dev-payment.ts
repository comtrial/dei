import { supabase } from '@/lib/supabase';

export async function completeLocalDevConsumablePurchase(productId: string) {
  const { data, error } = await supabase.rpc('complete_local_dev_consumable_purchase', {
    p_product_id: productId,
  });

  if (error) {
    throw error;
  }

  return data;
}
