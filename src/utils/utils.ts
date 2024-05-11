// ISO 8601 转 秒
export const ISO8601ToSeconds = (duration: string): number => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (match) {
        const hours = (parseInt(match[1]) || 0);
        const minutes = (parseInt(match[2]) || 0);
        const seconds = (parseInt(match[3]) || 0);

        return hours * 3600 + minutes * 60 + seconds;
    } else {
        return 0;
    }
};