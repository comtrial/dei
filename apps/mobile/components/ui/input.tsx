import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';

function Input({
  autoCapitalize = 'none',
  autoCorrect = false,
  className,
  editable = true,
  spellCheck = false,
  ...props
}: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      className={cn(
        'dark:bg-input/30 border-input bg-card text-foreground flex h-12 w-full min-w-0 flex-row items-center rounded-md border px-4 py-2 text-base leading-5 shadow-none sm:h-11',
        editable === false &&
          cn(
            'opacity-50',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
          ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className
      )}
      editable={editable}
      focusable={editable}
      spellCheck={spellCheck}
      textAlignVertical={Platform.OS === 'android' ? 'center' : undefined}
      underlineColorAndroid="transparent"
      {...props}
    />
  );
}

export { Input };
