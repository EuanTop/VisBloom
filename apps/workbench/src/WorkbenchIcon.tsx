import type { Icon as Glyph, IconProps } from '@phosphor-icons/react';
import { ChatTeardropDotsIcon } from '@phosphor-icons/react/dist/csr/ChatTeardropDots';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { DatabaseIcon } from '@phosphor-icons/react/dist/csr/Database';
import { StackIcon } from '@phosphor-icons/react/dist/csr/Stack';
import { CodeBlockIcon } from '@phosphor-icons/react/dist/csr/CodeBlock';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { ExportIcon } from '@phosphor-icons/react/dist/csr/Export';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise';
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/csr/ArrowsOut';
import { ArrowsInIcon } from '@phosphor-icons/react/dist/csr/ArrowsIn';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { NotePencilIcon } from '@phosphor-icons/react/dist/csr/NotePencil';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { SpinnerGapIcon } from '@phosphor-icons/react/dist/csr/SpinnerGap';
import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play';
import { PauseIcon } from '@phosphor-icons/react/dist/csr/Pause';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
const icons: Record<string, Glyph> = { chat:ChatTeardropDotsIcon,plus:PlusIcon,data:DatabaseIcon,layers:StackIcon,code:CodeBlockIcon,upload:UploadSimpleIcon,export:ExportIcon,history:ClockCounterClockwiseIcon,settings:SlidersHorizontalIcon,close:XIcon,check:CheckIcon,expand:ArrowsOutIcon,collapse:ArrowsInIcon,arrow:ArrowRightIcon,document:NotePencilIcon,down:CaretDownIcon,loading:SpinnerGapIcon,play:PlayIcon,pause:PauseIcon,replay:ArrowCounterClockwiseIcon };
export default function WorkbenchIcon({name,size=19,...props}:{name:string;size?:number}&IconProps){
  const Component=icons[name]??NotePencilIcon;
  return <Component {...props} size={size} weight={['chat','data','code','settings','play','pause'].includes(name)?'fill':'bold'} aria-hidden="true"/>;
}
