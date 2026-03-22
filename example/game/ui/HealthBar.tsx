export default function HealthBar() {
  return (
    <div className="absolute top-4 left-0 z-10 flex w-full justify-center @md:left-4 @md:w-auto">
      <div className="flex w-40 items-center gap-2 @max-md:mx-auto @md:w-48">
        <span className="text-xs font-bold text-white">HP</span>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-700 @md:h-4">
          <div className="h-full w-3/4 rounded-full bg-red-500" />
        </div>
      </div>
    </div>
  )
}
