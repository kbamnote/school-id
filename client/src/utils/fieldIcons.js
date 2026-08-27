import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  Calendar,
  ChevronDownSquare,
  CircleDot,
  CheckSquare,
  MapPin,
  Camera,
  PenTool,
  FileText,
  BadgeCheck,
  EyeOff,
  Heading,
  Info,
  Minus,
  HelpCircle,
} from 'lucide-react';

/**
 * Maps the icon name the server sends with each field definition to a real
 * component. Keeping the mapping here means the API stays free of frontend
 * concerns while the builder still renders a proper icon per type.
 */
const ICONS = {
  type: Type,
  'align-left': AlignLeft,
  hash: Hash,
  mail: Mail,
  phone: Phone,
  calendar: Calendar,
  'chevron-down-square': ChevronDownSquare,
  'circle-dot': CircleDot,
  'check-square': CheckSquare,
  'map-pin': MapPin,
  camera: Camera,
  'pen-tool': PenTool,
  'file-text': FileText,
  badge: BadgeCheck,
  'eye-off': EyeOff,
  heading: Heading,
  info: Info,
  minus: Minus,
};

export function fieldIcon(name) {
  return ICONS[name] || HelpCircle;
}

export default fieldIcon;
