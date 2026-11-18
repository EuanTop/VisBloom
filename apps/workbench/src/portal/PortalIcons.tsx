import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react';
import { ArrowDownIcon as ArrowDownGlyph } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowUpRightIcon as ArrowUpRightGlyph } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { CodeBlockIcon as BracesGlyph } from '@phosphor-icons/react/dist/csr/CodeBlock';
import { CaretDownIcon as ChevronDownGlyph } from '@phosphor-icons/react/dist/csr/CaretDown';
import { DatabaseIcon as DatabaseGlyph } from '@phosphor-icons/react/dist/csr/Database';
import { FileJsIcon as FileJsonGlyph } from '@phosphor-icons/react/dist/csr/FileJs';
import { SpinnerGapIcon as LoaderCircleGlyph } from '@phosphor-icons/react/dist/csr/SpinnerGap';
import { ListIcon as MenuGlyph } from '@phosphor-icons/react/dist/csr/List';
import { ChatTeardropDotsIcon as MessageSquareGlyph } from '@phosphor-icons/react/dist/csr/ChatTeardropDots';
import { CursorClickIcon as MousePointer2Glyph } from '@phosphor-icons/react/dist/csr/CursorClick';
import { PauseIcon as PauseGlyph } from '@phosphor-icons/react/dist/csr/Pause';
import { PlayIcon as PlayGlyph } from '@phosphor-icons/react/dist/csr/Play';
import { PlusIcon as PlusGlyph } from '@phosphor-icons/react/dist/csr/Plus';
import { ArrowCounterClockwiseIcon as RotateCcwGlyph } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { SlidersHorizontalIcon as SlidersHorizontalGlyph } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { SparkleIcon as SparklesGlyph } from '@phosphor-icons/react/dist/csr/Sparkle';
import { ArrowsOutIcon as ExpandGlyph } from '@phosphor-icons/react/dist/csr/ArrowsOut';
import { XIcon as XGlyph } from '@phosphor-icons/react/dist/csr/X';
import { GlobeHemisphereWestIcon as GlobeGlyph } from '@phosphor-icons/react/dist/csr/GlobeHemisphereWest';
import { MapTrifoldIcon as MapGlyph } from '@phosphor-icons/react/dist/csr/MapTrifold';
import { CopyIcon as CopyGlyph } from '@phosphor-icons/react/dist/csr/Copy';
import { CheckIcon as CheckGlyph } from '@phosphor-icons/react/dist/csr/Check';
import { DownloadSimpleIcon as DownloadGlyph } from '@phosphor-icons/react/dist/csr/DownloadSimple';

function styled(Glyph: Icon, weight: IconWeight) {
  return function PortalIcon(props: IconProps) { return <Glyph {...props} weight={weight} aria-hidden="true" />; }
}

export const ArrowDown = styled(ArrowDownGlyph, 'bold');
export const ArrowUpRight = styled(ArrowUpRightGlyph, 'bold');
export const Braces = styled(BracesGlyph, 'fill');
export const ChevronDown = styled(ChevronDownGlyph, 'bold');
export const Database = styled(DatabaseGlyph, 'fill');
export const FileJson = styled(FileJsonGlyph, 'fill');
export const LoaderCircle = styled(LoaderCircleGlyph, 'bold');
export const Menu = styled(MenuGlyph, 'bold');
export const MessageSquare = styled(MessageSquareGlyph, 'fill');
export const MousePointer2 = styled(MousePointer2Glyph, 'fill');
export const Pause = styled(PauseGlyph, 'fill');
export const Play = styled(PlayGlyph, 'fill');
export const Plus = styled(PlusGlyph, 'bold');
export const RotateCcw = styled(RotateCcwGlyph, 'bold');
export const SlidersHorizontal = styled(SlidersHorizontalGlyph, 'fill');
export const Sparkles = styled(SparklesGlyph, 'fill');
export const X = styled(XGlyph, 'bold');
export const Globe = styled(GlobeGlyph, 'fill');
export const MapView = styled(MapGlyph, 'fill');


export const Expand = styled(ExpandGlyph, 'bold');
export const Copy = styled(CopyGlyph, 'bold');
export const Check = styled(CheckGlyph, 'bold');
export const Download = styled(DownloadGlyph, 'fill');
