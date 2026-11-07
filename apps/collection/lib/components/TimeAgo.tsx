import { useEffect, useState } from "react";
import { Text } from "react-native";
import JavascriptTimeAgo from "javascript-time-ago";

let timeAgo: JavascriptTimeAgo | undefined;

function getTimeAgo() {
  timeAgo ??= new JavascriptTimeAgo("en");
  return timeAgo;
}

export default function TimeAgo({ date }: { date: number | Date }) {
  const [text, setText] = useState(() => getTimeAgo().format(date));

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      const [formatted, timeToNextUpdate] = getTimeAgo().format(date, {
        getTimeToNextUpdate: true,
      });
      setText(formatted);
      timeout = setTimeout(update, Math.max(timeToNextUpdate ?? 60_000, 1_000));
    };

    update();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [date]);

  return <Text>{text}</Text>;
}
