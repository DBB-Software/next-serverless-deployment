export const chunkArray = <T>(array: T[], chunkSize: number): T[][] =>
  Array.from({ length: Math.ceil(array.length / chunkSize) }, (_v, i) =>
    array.slice(i * chunkSize, i * chunkSize + chunkSize)
  )
