<script lang="ts">
  import { formatAbsoluteDate, formatRelativeDate } from '$lib/dateFormatting';

  let { date, withTime = true }: {
    date: Date,
    withTime?: boolean,
  } = $props();

  const absoluteDate = $derived(formatAbsoluteDate(date, withTime));
</script>

<time datetime={date.toISOString()} title={absoluteDate}>{formatRelativeDate(date)}</time>
