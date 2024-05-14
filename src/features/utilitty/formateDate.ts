
export const formatDate = (dateString: string | undefined): string | undefined => {
    if (!dateString) return
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    };
    return new Date(dateString).toLocaleString('en-US', options);
};
