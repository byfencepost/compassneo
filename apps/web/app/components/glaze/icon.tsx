import type {Icon as SolarIcon, IconProps as SolarProps} from '@solar-icons/react/lib/types';
import {
  AddIcon, AltArrowDownIcon, AltArrowLeftIcon, AltArrowRightIcon, AltArrowUpIcon, ArrowDownIcon, ArrowLeftIcon,
  ArrowRightDownIcon, ArrowRightIcon, ArrowRightUpIcon, ArrowUpIcon, BasketballIcon, BellIcon, BookBookmarkIcon, BookIcon,
  BotIcon, BrainIcon, CalculatorIcon, CalendarIcon, CalendarMarkIcon, CaseIcon, ChecklistMinimalisticIcon,
  CheckCircleIcon, CheckIcon, ChefHatIcon, ChevronsUpDownIcon, ClapperboardIcon, ClipboardTextIcon, ClockCircleIcon,
  CloseCircleIcon, CodeIcon, Columns3Icon, CommandIcon, ConfettiIcon, CopyIcon, DangerCircleIcon, DangerTriangleIcon,
  DatabaseIcon, DocumentTextIcon, DownloadMinimalisticIcon, EarthIcon, EyeClosedIcon, EyeIcon, FileAudioIcon, FileCodeIcon, FileIcon,
  FileImageIcon, FileSpreadsheetIcon, FileTextIcon, FolderIcon, FolderOpenIcon, FolderWithFilesIcon, FileVideoCameraIcon, FileZipIcon, FilterIcon, ForwardIcon, GlobalIcon, GraphUpIcon,
  HashtagIcon, HeartPulseIcon, HomeSmileIcon, HourglassIcon, InboxIcon, InfoCircleIcon, KeyIcon, LeafIcon, LinkIcon,
  LockIcon, LogoutIcon, MagnifierIcon, MapPointIcon, MaskHappyIcon, MaximizeSquareIcon, MedalRibbonStarIcon,
  MenuDotsIcon, MicrophoneIcon, MinimizeSquareIcon, MinusIcon, MonitorSmartphoneIcon, MoonIcon, MusicNotesIcon,
  MutedIcon, NotebookIcon, PaletteIcon, PaperclipIcon, PauseIcon, PenIcon, PlayCircleIcon, PlayIcon, PresentationGraphIcon, ProgrammingIcon, RefreshIcon,
  RulerPenIcon, ScaleIcon, SendSquareIcon, SettingsIcon, ShieldCrossIcon, SquareAcademicCapIcon, SquareShareLineIcon,
  StarsIcon, StopIcon, SunIcon, SunsetIcon, TableIcon, TestTubeIcon, ToolboxIcon,
  TranslationIcon, TrashBinTrashIcon, UndoLeftIcon, UndoLeftRoundIcon, UndoRightRoundIcon, UploadMinimalisticIcon,
  UserRoundedIcon, UserSpeakRoundedIcon, UsersGroupRoundedIcon, WidgetIcon,
} from '@solar-icons/react/bold';
// The two marks of a change to a lesson, a room switch and a relief teacher, are drawn in line (Linear), not filled:
// they ride beside a name or inside a room's pill, where a solid shape would read heavier than the word it qualifies.
import {TransferHorizontalIcon, UsersGroupTwoRoundedIcon} from '@solar-icons/react/linear';
// The student's own pages (features/student): attendance, events and Chronicle, the kinds of event, a commendation.
import {
  BalloonIcon, BusIcon, CalendarDateIcon, ChatRoundDotsIcon, ClipboardCheckIcon, CupHotIcon, Flag2Icon, LikeIcon,
  LetterIcon, LightbulbBoltIcon, MicrophoneLargeIcon, NotebookBookmarkIcon, StarIcon, UserCheckRoundedIcon,
} from '@solar-icons/react/bold';
import {forwardRef} from 'react';
import {cn} from '@/lib/glaze/utils';

// The one place Glaze imports icons from. Components import from here, never from @solar-icons/react, so the set can
// be swapped in one file.
//
// Compass Neo draws its glyphs from Solar (solar-icons.dev) in the filled style, Bold: solid shapes, so a glyph holds
// its weight at 12px and carries a class's colour as a shape, not a hairline. The room switch and the relief are the
// exceptions, in line (see the import above), stroked at 2 so they hold at 12px. The weight prop below is kept so
// Glaze's components and older call sites still compile, and changes nothing. Only the glyphs the app
// uses, under the names its components call them; to use another, import it above and name it here.
export const Add = AddIcon;
export const ArrowDown = ArrowDownIcon;
export const ArrowLeft = ArrowLeftIcon;
export const ArrowRight = ArrowRightIcon;
export const ArrowUp = ArrowUpIcon;
export const ArrowUpRight = ArrowRightUpIcon;
export const ArrowDownRight = ArrowRightDownIcon;
export const Attachment = PaperclipIcon;
export const Bot = BotIcon;
export const Calendar = CalendarIcon;
export const Check = CheckIcon;
export const ChevronDown = AltArrowDownIcon;
export const ChevronLeft = AltArrowLeftIcon;
export const ChevronRight = AltArrowRightIcon;
export const ChevronSort = ChevronsUpDownIcon;
export const ChevronUp = AltArrowUpIcon;
export const ChartLine = GraphUpIcon;
export const Close = CloseCircleIcon;
export const CollapseAll = MinimizeSquareIcon;
export const Code = CodeIcon;
export const Columns = Columns3Icon;
export const Copy = CopyIcon;
export const Dark = MoonIcon;
export const Document = DocumentTextIcon;
export const DocumentBlank = FileIcon;
export const Download = DownloadMinimalisticIcon;
export const Edit = PenIcon;
export const Empty = InboxIcon;
export const ExpandAll = MaximizeSquareIcon;
export const Failed = DangerCircleIcon;
/** Status fail: a cross in a ring, so it differs from warn's triangle in shape, not only hue. */
export const FailedMark = CloseCircleIcon;
export const External = SquareShareLineIcon;
export const FileArchive = FileZipIcon;
export const FileAudio = FileAudioIcon;
export const FileCode = FileCodeIcon;
export const FileImage = FileImageIcon;
export const FileTable = FileSpreadsheetIcon;
export const FileVideo = FileVideoCameraIcon;
export const Filter = FilterIcon;
export const FollowUp = ForwardIcon;
export const Globe = GlobalIcon;
export const Hide = EyeClosedIcon;
export const Information = InfoCircleIcon;
export const Key = KeyIcon;
export const Light = SunIcon;
export const Link = LinkIcon;
export const Locked = LockIcon;
export const NoAccess = ShieldCrossIcon;
export const NoResults = MagnifierIcon;
export const Microphone = MicrophoneIcon;
export const MicrophoneOff = MutedIcon;
export const Model = BrainIcon;
export const More = MenuDotsIcon;
export const Pause = PauseIcon;
/**
 * The pending arc: a 3/4 ring, drawn here rather than taken from Solar. Solar's nearest (Restart) carries an arrowhead
 * off one end, so turned in place it wobbles round its own centre and reads as "reload" rather than "working".
 */
export const Pending: SolarIcon = forwardRef<SVGSVGElement, SolarProps>(function Pending(
  {size = 24, className, isolated: _i, strokeWidth: _s, color, alt, iconName: _n, secondaryColor: _c, secondaryOpacity: _o, ...props},
  ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
      {alt && <title>{alt}</title>}
      <path d="M12 3a9 9 0 1 1-9 9" stroke={color ?? 'currentColor'} strokeWidth={3} strokeLinecap="round"/>
    </svg>
  );
});
export const Play = PlayIcon;
/** Compass Neo: a school in the school picker. */
export const School = SquareAcademicCapIcon;
export const Sync = RefreshIcon;
export const Return = UndoLeftRoundIcon;
export const Search = MagnifierIcon;
export const Send = SendSquareIcon;
export const Settings = SettingsIcon;
/** Compass Neo: sign out. */
export const SignOut = LogoutIcon;
/** Compass Neo, the timetable: a relief teacher covering a class. */
export const Relief = UsersGroupTwoRoundedIcon;
/** Compass Neo, the timetable: a class moved to another room. */
export const RoomChange = TransferHorizontalIcon;
/** Compass Neo, the timetable: a room, a teacher, a class code, learning tasks, grades. */
export const Room = MapPointIcon;
export const Teacher = UserSpeakRoundedIcon;
export const ClassCode = HashtagIcon;
export const LearningTask = ClipboardTextIcon;
export const Grade = MedalRibbonStarIcon;
/** Compass Neo, the class panel: the overview tab, assessments, teachers' notices. */
export const Overview = WidgetIcon;
export const Assessments = ChecklistMinimalisticIcon;
export const Notice = BellIcon;
/** Compass Neo, the class panel: work handed in (the Work tab), resources (Files: folders, a Compass page, a file's kind) and
 * classmates (People). */
export const Library = FolderWithFilesIcon;
export const Folder = FolderIcon;
export const FolderOpen = FolderOpenIcon;
export const Page = NotebookIcon;
export const FilePdf = FileTextIcon;
export const FileSlides = PresentationGraphIcon;
export const FileDatabase = DatabaseIcon;
export const VideoLink = PlayCircleIcon;
export const People = UsersGroupRoundedIcon;
/** Compass Neo, the timetable: back to today; a day without classes; the day's classes over. */
export const Today = CalendarMarkIcon;
export const NoClasses = ConfettiIcon;
export const DayDone = SunsetIcon;
/** Compass Neo, the timetable: a glyph per kind of subject (lib/neo/subjects.ts picks one from the class's name). */
export const SubjectMaths = CalculatorIcon;
export const SubjectEnglish = BookIcon;
export const SubjectScience = TestTubeIcon;
export const SubjectHumanities = EarthIcon;
export const SubjectTechnology = ToolboxIcon;
export const SubjectComputing = ProgrammingIcon;
export const SubjectSport = BasketballIcon;
export const SubjectHealth = HeartPulseIcon;
export const SubjectMedia = ClapperboardIcon;
export const SubjectArt = PaletteIcon;
export const SubjectMusic = MusicNotesIcon;
export const SubjectDrama = MaskHappyIcon;
export const SubjectHomeroom = HomeSmileIcon;
export const SubjectLanguage = TranslationIcon;
export const SubjectFood = ChefHatIcon;
export const SubjectLaw = ScaleIcon;
export const SubjectNature = LeafIcon;
export const SubjectDesign = RulerPenIcon;
export const SubjectBusiness = CaseIcon;
export const SubjectOther = BookBookmarkIcon;
/** Compass Neo: the theme that follows the device. */
export const AutoTheme = MonitorSmartphoneIcon;
export const Show = EyeIcon;
export const Sparkle = StarsIcon;
export const Stop = StopIcon;
export const Subtract = MinusIcon;
export const Success = CheckCircleIcon;
export const TableView = TableIcon;
export const Terminal = CommandIcon;
export const Time = ClockCircleIcon;
export const Tool = ToolboxIcon;
export const TrashCan = TrashBinTrashIcon;
export const Undo = UndoLeftIcon;
export const Upload = UploadMinimalisticIcon;
export const UserAvatar = UserRoundedIcon;
export const Warning = DangerTriangleIcon;
export const Waiting = HourglassIcon;
export const Wrap = UndoRightRoundIcon;
/** Compass Neo, the student's own pages: attendance, events, Chronicle; nothing coming up. */
export const Attendance = UserCheckRoundedIcon;
export const Events = CalendarDateIcon;
export const Chronicle = NotebookBookmarkIcon;
export const Calm = CupHotIcon;
/** Compass Neo, events by kind (an excursion is told apart by its title), and a commendation in Chronicle. */
export const EventGeneric = Flag2Icon;
export const EventExcursion = BusIcon;
export const EventMeeting = ChatRoundDotsIcon;
export const EventAssembly = MicrophoneLargeIcon;
export const EventActivity = BalloonIcon;
export const EventExam = ClipboardCheckIcon;
export const EventClub = UsersGroupRoundedIcon;
export const Commendation = LikeIcon;
export const EventWorkshop = LightbulbBoltIcon;
/** Compass Neo, Chronicle: house points, and a letter sent home. */
export const HousePoints = StarIcon;
export const LetterHome = LetterIcon;

export type GlazeIcon = SolarIcon;

/** Kept from Glaze's Phosphor days so callers compile; every glyph is Solar Bold whichever is passed. */
export type IconWeight = 'light' | 'regular' | 'bold' | 'fill';

type IconProps = Omit<SolarProps, 'size' | 'color' | 'alt' | 'ref'> & {
  /** The icon, imported from this file. */
  icon: GlazeIcon;
  /** px. 12 in a small control or a tag, 14 in a control (the default), 16 in a large one, 20 and 24 on their own, 32 and 40 only for an empty state's glyph. */
  size?: 12 | 14 | 16 | 20 | 24 | 32 | 40;
  /** Ignored: Solar Bold has one weight. */
  weight?: IconWeight;
  /** Accessible name. Without one the icon is decorative and hidden from assistive tech. */
  label?: string;
};

export function Icon({icon: Glyph, size = 14, weight: _weight, label, className, ...props}: IconProps) {
  return <Glyph
    size={size}
    focusable="false"
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
    // Solar reads its colour from a SolarProvider when there is one; Compass Neo has none, so the glyph takes the text colour.
    isolated
    // Only the line glyphs read it; a filled glyph's paths have no stroke.
    strokeWidth={2}
    className={cn('shrink-0', className)}
    // eslint-disable-next-line glaze/no-inline-style -- an icon follows the app's size knob (--ui-scale, tokens.css) like the type beside it
    style={{width: `calc(${size}px * var(--ui-scale, 1))`, height: `calc(${size}px * var(--ui-scale, 1))`}}
    {...props}
  />;
}
